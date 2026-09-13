import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const sessionName = 'releaseproof_session';

export function sessionCookieName(): string { return sessionName; }

export function createSession(secret: string): { value: string; csrfToken: string } {
  const csrfToken = randomBytes(32).toString('base64url');
  const issuedAt = Date.now().toString();
  const payload = `${issuedAt}.${csrfToken}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return { value: `${payload}.${signature}`, csrfToken };
}

export function verifySession(value: string | undefined, csrfToken: string | null, secret: string): boolean {
  if (!value) return false;
  const [issuedAt, storedCsrf, signature] = value.split('.');
  if (!issuedAt || !storedCsrf || !signature) return false;
  if (csrfToken !== null && storedCsrf !== csrfToken) return false;
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs > Date.now() + 60_000 || Date.now() - issuedAtMs > 8 * 60 * 60 * 1_000) return false;
  const expected = createHmac('sha256', secret).update(`${issuedAt}.${storedCsrf}`).digest('base64url');
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
