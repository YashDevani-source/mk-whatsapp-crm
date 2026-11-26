import { describe, expect, it } from 'vitest';
import { DecryptError, decrypt, encrypt, keyFromHex } from './crypto.ts';

const key = keyFromHex('ab'.repeat(32));
const otherKey = keyFromHex('cd'.repeat(32));
const AAD = 'wa:fake:creds';

// Flips one character of the ciphertext part, keeping it valid base64url.
function tamper(value: string): string {
  const parts = value.split('.');
  const ct = parts[3] ?? '';
  const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  return [...parts.slice(0, 3), flipped].join('.');
}

describe('session encryption', () => {
  it('WA-06 a value round-trips and each write uses a new IV', () => {
    const a = encrypt(key, '{"secret":"value"}', AAD);
    const b = encrypt(key, '{"secret":"value"}', AAD);
    expect(a.startsWith('v1.')).toBe(true);
    expect(a.split('.')).toHaveLength(4);
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret');
    expect(decrypt(key, a, AAD)).toBe('{"secret":"value"}');
    expect(decrypt(key, encrypt(key, '', AAD), AAD)).toBe('');
  });

  it('WA-06 a tampered ciphertext, a wrong key or another row fail with an error', () => {
    const value = encrypt(key, 'credentials', AAD);
    expect(() => decrypt(key, tamper(value), AAD)).toThrow(DecryptError);
    expect(() => decrypt(otherKey, value, AAD)).toThrow(DecryptError);
    expect(() => decrypt(key, value, 'wa:fake:key:pre-key:1')).toThrow(DecryptError);
  });

  it('WA-06 an empty value or an unknown format version fails with an error', () => {
    const value = encrypt(key, 'credentials', AAD);
    expect(() => decrypt(key, '', AAD)).toThrow(DecryptError);
    expect(() => decrypt(key, value.replace(/^v1\./, 'v2.'), AAD)).toThrow(DecryptError);
    expect(() => decrypt(key, 'v1.only.three', AAD)).toThrow(DecryptError);
  });

  it('WA-06 a key that is not 32 bytes is refused', () => {
    expect(() => keyFromHex('ab'.repeat(16))).toThrow();
  });
});
