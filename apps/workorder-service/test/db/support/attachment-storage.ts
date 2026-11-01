import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { validateEnv, type AppEnv } from '../../../src/config/env.validation';
import {
  type AttachmentStorage,
  storageUnavailable,
} from '../../../src/attachments/attachment-storage';
import { S3AttachmentStorage } from '../../../src/attachments/s3-attachment.storage';
import { conflict } from '../../../src/common/errors';

class MemoryStorage implements AttachmentStorage {
  readonly enabled = true;
  readonly data = new Map<string, Buffer>();
  async ticket(key: string, mimeType: string) {
    return {
      uploadUrl: `http://storage.invalid/${encodeURIComponent(key)}`,
      headers: { 'Content-Type': mimeType },
    };
  }
  async read(key: string) {
    const bytes = this.data.get(key);
    if (!bytes) throw conflict('UPLOAD_NOT_READY', 'No object');
    return Buffer.from(bytes);
  }
  async write(key: string, bytes: Buffer) {
    this.data.set(key, Buffer.from(bytes));
  }
  async download(key: string) {
    if (!this.data.has(key)) throw storageUnavailable();
    return {
      downloadUrl: `http://storage.invalid/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
  async remove(key: string) {
    this.data.delete(key);
  }
  async *objects() {
    for (const key of this.data.keys())
      yield { key, lastModified: new Date(0) };
  }
}

/** Same DB/HTTP cases with either explicit memory double or real S3 adapter.
 * Fault hooks alter boundary timing/failures, not actual stored bytes/results. */
export class AttachmentTestStorage implements AttachmentStorage {
  readonly enabled = true;
  failRead = false;
  failRemove = false;
  afterRead?: () => Promise<void>;
  afterWrite?: () => Promise<void>;
  oldObjects = false;
  readonly inner: AttachmentStorage;
  private admin?: S3Client;
  constructor(
    readonly real: boolean,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.inner = real ? new S3AttachmentStorage(config) : new MemoryStorage();
  }
  async initialize() {
    if (!this.real) return;
    const bucket = this.config.get('WORKORDER_ATTACHMENT_BUCKET', {
      infer: true,
    })!;
    if (!/^pbl6-wo-test-[0-9a-f-]+$/.test(bucket))
      throw new Error(
        'Real storage test requires a unique generated test bucket',
      );
    this.admin = new S3Client({
      endpoint: `${this.config.get('MINIO_USE_SSL', { infer: true }) ? 'https' : 'http'}://${this.config.get('MINIO_ENDPOINT', { infer: true })}:${this.config.get('MINIO_PORT', { infer: true })}`,
      region: this.config.get('MINIO_REGION', { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get('MINIO_ACCESS_KEY', { infer: true })!,
        secretAccessKey: this.config.get('MINIO_SECRET_KEY', { infer: true })!,
      },
    });
    await this.admin.send(new CreateBucketCommand({ Bucket: bucket }));
    await this.admin.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ['http://localhost:5173'],
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['Content-Type'],
            },
          ],
        },
      }),
    );
  }
  async close() {
    if (this.admin) {
      const Bucket = this.config.get('WORKORDER_ATTACHMENT_BUCKET', {
        infer: true,
      })!;
      let cursor: string | undefined;
      do {
        const page = await this.admin.send(
          new ListObjectsV2Command({ Bucket, ContinuationToken: cursor }),
        );
        if (page.Contents?.length)
          await this.admin.send(
            new DeleteObjectsCommand({
              Bucket,
              Delete: {
                Objects: page.Contents.map((row) => ({ Key: row.Key! })),
                Quiet: true,
              },
            }),
          );
        cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (cursor);
      await this.admin.send(new DeleteBucketCommand({ Bucket }));
      this.admin.destroy();
    }
    if (this.inner instanceof S3AttachmentStorage) this.inner.onModuleDestroy();
  }
  resetFaults() {
    this.failRead = false;
    this.failRemove = false;
    this.afterRead = undefined;
    this.afterWrite = undefined;
    this.oldObjects = false;
  }
  ticket(key: string, mimeType: string, expiresAt: Date) {
    return this.inner.ticket(key, mimeType, expiresAt);
  }
  async read(key: string) {
    if (this.failRead) {
      if (!this.real) throw storageUnavailable();
      const unavailable = this.unreachable();
      try {
        return await unavailable.read(key);
      } finally {
        unavailable.onModuleDestroy();
      }
    }
    const bytes = await this.inner.read(key);
    await this.afterRead?.();
    return bytes;
  }
  async write(key: string, bytes: Buffer, mimeType: string) {
    await this.inner.write(key, bytes, mimeType);
    await this.afterWrite?.();
  }
  download(key: string, fileName: string) {
    return this.inner.download(key, fileName);
  }
  async remove(key: string) {
    if (this.failRemove) {
      if (!this.real) throw storageUnavailable();
      const unavailable = this.unreachable();
      try {
        return await unavailable.remove(key);
      } finally {
        unavailable.onModuleDestroy();
      }
    }
    return this.inner.remove(key);
  }
  private unreachable() {
    // Real SDK/HTTP connection failure, isolated from the running MinIO server.
    return new S3AttachmentStorage(
      new ConfigService({
        ...validateEnv(process.env),
        MINIO_ENDPOINT: '127.0.0.1',
        MINIO_PORT: 1,
      }),
    );
  }
  async *objects() {
    for await (const row of this.inner.objects())
      yield {
        ...row,
        lastModified: this.oldObjects ? new Date(0) : row.lastModified,
      };
  }
  async put(
    ticket: { uploadUrl: string; headers: Record<string, string> },
    bytes: Buffer,
  ) {
    if (this.inner instanceof MemoryStorage)
      return this.inner.write(
        decodeURIComponent(new URL(ticket.uploadUrl).pathname.slice(1)),
        bytes,
      );
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: new Uint8Array(bytes),
    });
    if (!response.ok)
      throw new Error(`Storage PUT failed with status ${response.status}`);
  }
  async downloaded(url: string) {
    if (this.inner instanceof MemoryStorage)
      return this.inner.read(
        decodeURIComponent(new URL(url).pathname.slice(1)),
      );
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Storage GET failed with status ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
