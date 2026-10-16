// Stateless signed session token: base64url(JSON{uid,exp}) + "." + base64url(HMAC-SHA256).
// Uses Web Crypto (globalThis.crypto.subtle) rather than node:crypto so the
// SAME code runs in Next middleware (Edge runtime, no Node APIs, no Prisma)
// and in Node route handlers. Because it is stateless it cannot be revoked
// before `exp`; keep the TTL short-ish and rotate AUTH_SECRET to invalidate
// everything at once.

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SECRET_BYTES = 32;

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(purpose?: string): Promise<CryptoKey> {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error(
      'AUTH_SECRET is not set. Set a 32+ byte base64 secret in .env (generate with: openssl rand -base64 32).',
    );
  }
  const bytes = b64urlDecode(raw.replace(/=+$/, ''));
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(
      `AUTH_SECRET must decode to at least ${MIN_SECRET_BYTES} bytes, got ${bytes.length}. Generate with: openssl rand -base64 32`,
    );
  }
  const master = await crypto.subtle.importKey(
    'raw',
    bytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  if (!purpose) return master; // session tokens keep using the secret directly
  // Single-purpose tokens (email links) get their own derived key, so a token
  // minted for one purpose can never validate as another (or as a session).
  const derived = await crypto.subtle.sign('HMAC', master, encoder.encode(`budget-analyser:${purpose}`));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signWith(purpose: string | undefined, userId: string, ttlMs: number): Promise<string> {
  const key = await getKey(purpose);
  const payload = b64urlEncode(encoder.encode(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs })));
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifyWith(purpose: string | undefined, token: string): Promise<{ userId: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, sig] = parts;
    const key = await getKey(purpose);
    // crypto.subtle.verify compares in constant time.
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig) as BufferSource,
      encoder.encode(payload),
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number' || data.exp <= Date.now()) {
      return null;
    }
    return { userId: data.uid };
  } catch (err) {
    // A missing/short AUTH_SECRET is a server misconfiguration, not a bad
    // token: surface it instead of silently treating everyone as logged out.
    if (err instanceof Error && err.message.startsWith('AUTH_SECRET')) throw err;
    return null;
  }
}

export function signToken(userId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<string> {
  return signWith(undefined, userId, ttlMs);
}

/** Returns the user id for a valid, unexpired SESSION token; null otherwise. Never throws on bad input. */
export function verifyToken(token: string): Promise<{ userId: string } | null> {
  return verifyWith(undefined, token);
}

/** Single-purpose token (e.g. 'verify-email'); valid only for that exact purpose. */
export function signPurposeToken(purpose: string, userId: string, ttlMs: number): Promise<string> {
  return signWith(purpose, userId, ttlMs);
}

export function verifyPurposeToken(purpose: string, token: string): Promise<{ userId: string } | null> {
  return verifyWith(purpose, token);
}

/**
 * Reads the user id out of a token WITHOUT checking its signature. Only for
 * choosing which per-user key to verify with; never trust the result alone.
 */
export function peekTokenUserId(token: string): string | null {
  try {
    const payload = token.split('.')[0];
    if (!payload) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    return typeof data.uid === 'string' ? data.uid : null;
  } catch {
    return null;
  }
}
