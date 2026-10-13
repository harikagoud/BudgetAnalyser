import crypto from 'crypto';

// AES-256-GCM encryption for sensitive at-rest fields (Plaid access tokens).
// Key is a 32-byte value, base64-encoded in the ENCRYPTION_KEY env var.
// Per Constitution Principle I, the app must fail loudly at startup/first-use
// rather than silently storing anything in plaintext if the key is missing
// or malformed.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Set a 32-byte base64 key in .env (generate with: openssl rand -base64 32).',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}. Generate with: openssl rand -base64 32`,
    );
  }
  return key;
}

/**
 * Encrypts a plaintext string, returning a single string payload
 * (base64 iv + base64 authTag + base64 ciphertext, colon-delimited) suitable
 * for storage in a single text column.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

/**
 * Decrypts a payload produced by `encrypt`. Throws if the payload is
 * malformed or authentication fails (tampering/corruption).
 */
export function decrypt(payload: string): string {
  const key = getKey();
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
