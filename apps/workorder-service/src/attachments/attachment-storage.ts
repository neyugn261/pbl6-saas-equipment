import { ServiceUnavailableException } from '@nestjs/common';

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
export interface StoredObject {
  key: string;
  lastModified: Date;
}
export interface AttachmentStorage {
  readonly enabled: boolean;
  ticket(
    key: string,
    mimeType: string,
    expiresAt: Date,
  ): Promise<{ uploadUrl: string; headers: Record<string, string> }>;
  read(key: string): Promise<Buffer>;
  write(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  download(
    key: string,
    fileName: string,
  ): Promise<{ downloadUrl: string; expiresAt: string }>;
  remove(key: string): Promise<void>;
  objects(): AsyncIterable<StoredObject>;
}
export const storageUnavailable = () =>
  new ServiceUnavailableException({
    code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
    message: 'Attachment storage is unavailable',
  });
