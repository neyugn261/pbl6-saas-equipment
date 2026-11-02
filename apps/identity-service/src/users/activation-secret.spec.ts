import {
  decryptActivationUrl,
  encryptActivationUrl,
} from './activation-secret';

describe('activation URL encryption', () => {
  const key = 'ab'.repeat(32);
  const url = 'https://portal.example/activate#token=one-time-secret';

  it('decrypts only with the correct key and rejects altered ciphertext', () => {
    const ciphertext = encryptActivationUrl(url, key);
    expect(ciphertext).not.toContain('one-time-secret');
    expect(decryptActivationUrl(ciphertext, key)).toBe(url);
    expect(() => decryptActivationUrl(ciphertext, 'cd'.repeat(32))).toThrow();
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[tampered.length - 1] ^= 1;
    expect(() =>
      decryptActivationUrl(tampered.toString('base64'), key),
    ).toThrow();
  });
});
