import crypto from 'crypto';

// scrypt (Node built-in: no native dependency to install), per-hash random
// salt, constant-time comparison. Stored as
//   scrypt$N$r$p$<salt b64>$<hash b64>
// so the cost parameters can be raised later without breaking old hashes.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N: n, r, p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Never throws: a malformed stored hash simply fails verification. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    if (expected.length !== KEY_LEN) return false;
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
