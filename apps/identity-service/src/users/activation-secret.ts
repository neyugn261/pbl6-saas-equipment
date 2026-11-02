import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM: base64(iv || authentication tag || encrypted URL). */
export function encryptActivationUrl(url: string, hexKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptActivationUrl(
  ciphertext: string,
  hexKey: string,
): string {
  const bytes = Buffer.from(ciphertext, 'base64');
  if (bytes.length < 29) throw new Error('Invalid activation ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(hexKey, 'hex'),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}
