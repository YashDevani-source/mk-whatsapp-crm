// WA-06: AES-256-GCM for the stored WhatsApp session. Format `v1.<iv>.<tag>.<ciphertext>`, each
// part base64url. The AAD binds a value to its row, so a value copied to another row fails.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DecryptError extends Error {
  override name = 'DecryptError';
}

// SESSION_ENCRYPTION_KEY is 64 hex characters (checked by WorkerEnv); this guards direct callers.
export function keyFromHex(hex: string): Buffer {
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('encryption key must be 32 bytes');
  return key;
}

export function encrypt(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url'));
  return [VERSION, ...parts].join('.');
}

// Throws DecryptError for any value that is malformed, from another key or row, or tampered with.
// The error message never contains the value.
export function decrypt(key: Buffer, value: string, aad: string): string {
  const [version, iv64, tag64, ciphertext64, ...rest] = value.split('.');
  if (version !== VERSION || ciphertext64 === undefined || rest.length > 0) {
    throw new DecryptError('unknown format');
  }
  const iv = Buffer.from(iv64 ?? '', 'base64url');
  const tag = Buffer.from(tag64 ?? '', 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new DecryptError('unknown format');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    const ciphertext = Buffer.from(ciphertext64, 'base64url');
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptError('authentication failed');
  }
}
