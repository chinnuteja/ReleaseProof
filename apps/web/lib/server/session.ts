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
  if (!value || !csrfToken) return false;
  const [issuedAt, storedCsrf, signature] = value.split('.');
  if (!issuedAt || !storedCsrf || !signature || storedCsrf !== csrfToken) return false;
  if (Date.now() - Number(issuedAt) > 8 * 60 * 60 * 1_000) return false;
  const expected = createHmac('sha256', secret).update(`${issuedAt}.${storedCsrf}`).digest('base64url');
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
