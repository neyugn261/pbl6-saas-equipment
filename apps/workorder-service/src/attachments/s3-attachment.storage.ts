import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import type { AppEnv } from '../config/env.validation';
import { conflict } from '../common/errors';
import { MANAGED_PREFIX, MAX_ATTACHMENT_BYTES } from './attachment.policy';
import {
  type AttachmentStorage,
  storageUnavailable,
} from './attachment-storage';
import { UnprocessableEntityException } from '@nestjs/common';

@Injectable()
export class S3AttachmentStorage implements AttachmentStorage, OnModuleDestroy {
  readonly enabled: boolean;
  private readonly internal?: S3Client;
  private readonly signing?: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService<AppEnv, true>) {
    this.enabled = config.get('WORKORDER_ATTACHMENTS_ENABLED', { infer: true });
    this.bucket =
      config.get('WORKORDER_ATTACHMENT_BUCKET', { infer: true }) ?? '';
    if (!this.enabled) return;
    const options = {
      region: config.get('MINIO_REGION', { infer: true }),
      credentials: {
        accessKeyId: config.get('MINIO_ACCESS_KEY', { infer: true })!,
        secretAccessKey: config.get('MINIO_SECRET_KEY', { infer: true })!,
      },
      forcePathStyle: true,
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({
      ...options,
      endpoint: `${config.get('MINIO_USE_SSL', { infer: true }) ? 'https' : 'http'}://${config.get('MINIO_ENDPOINT', { infer: true })}:${config.get('MINIO_PORT', { infer: true })}`,
    });
    this.signing = new S3Client({
      ...options,
      endpoint: config.get('MINIO_PUBLIC_ENDPOINT', { infer: true }),
    });
  }
  onModuleDestroy() {
    this.internal?.destroy();
    this.signing?.destroy();
  }
  private requireClient() {
    if (!this.internal || !this.signing) throw storageUnavailable();
    return this.internal;
  }
  async ticket(key: string, mimeType: string, expiresAt: Date) {
    this.requireClient();
    const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (expiresIn <= 0)
      throw conflict('UPLOAD_EXPIRED', 'Upload intent expired');
    try {
      const uploadUrl = await getSignedUrl(
        this.signing!,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: mimeType,
        }),
        { expiresIn, signableHeaders: new Set(['content-type']) },
      );
      return { uploadUrl, headers: { 'Content-Type': mimeType } };
    } catch {
      throw storageUnavailable();
    }
  }
  async read(key: string) {
    const client = this.requireClient();
    const signal = AbortSignal.timeout(30_000);
    let body: Readable | undefined;
    const verificationError = () =>
      new UnprocessableEntityException({
        code: 'UPLOAD_VERIFICATION_FAILED',
        message: 'Stored object exceeds the maximum size',
      });
    const abort = () => body?.destroy(new Error('STORAGE_TIMEOUT'));
    try {
      const object = await client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: signal },
      );
      body = object.Body as Readable;
      if (!body)
        throw conflict('UPLOAD_NOT_READY', 'Upload bytes have not arrived');
      if ((object.ContentLength ?? 0) > MAX_ATTACHMENT_BYTES) {
        body.destroy();
        throw verificationError();
      }
      signal.addEventListener('abort', abort, { once: true });
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of body) {
        const bytes = Buffer.from(chunk);
        length += bytes.length;
        if (length > MAX_ATTACHMENT_BYTES) {
          body.destroy();
          throw verificationError();
        }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks, length);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        ['NoSuchKey', 'NotFound'].includes(String(error.name))
      )
        throw conflict('UPLOAD_NOT_READY', 'Upload bytes have not arrived');
      throw storageUnavailable();
    } finally {
      signal.removeEventListener('abort', abort);
      body?.destroy();
    }
  }
  async write(key: string, bytes: Buffer, mimeType: string) {
    try {
      await this.requireClient().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          IfNoneMatch: '*',
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } catch {
      throw storageUnavailable();
    }
  }
  async download(key: string, fileName: string) {
    const client = this.requireClient();
    const encoded = encodeURIComponent(fileName).replace(
      /['()*]/g,
      (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000);
      const expiresAt = new Date(signingDate.getTime() + 60_000).toISOString();
      const downloadUrl = await getSignedUrl(
        this.signing!,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encoded}`,
          ResponseCacheControl: 'no-store',
        }),
        { expiresIn: 60, signingDate },
      );
      return { downloadUrl, expiresAt };
    } catch {
      throw storageUnavailable();
    }
  }
  async remove(key: string) {
    try {
      await this.requireClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } catch {
      throw storageUnavailable();
    }
  }
  async *objects() {
    let cursor: string | undefined;
    do {
      let page;
      try {
        page = await this.requireClient().send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: MANAGED_PREFIX,
            ContinuationToken: cursor,
            MaxKeys: 100,
          }),
          { abortSignal: AbortSignal.timeout(30_000) },
        );
      } catch {
        throw storageUnavailable();
      }
      for (const object of page.Contents ?? [])
        if (object.Key && object.LastModified)
          yield { key: object.Key, lastModified: object.LastModified };
      cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (cursor);
  }
}
