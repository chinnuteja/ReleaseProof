import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { verifySession, sessionCookieName } from './session.js';

export function requireOperator(request: NextRequest): NextResponse | { csrfToken: string } {
  const secret = process.env.SESSION_SECRET;
  const configuredOrigin = process.env.APP_ORIGIN;
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const csrfToken = request.headers.get('x-csrf-token');
  const session = request.cookies.get(sessionCookieName())?.value;
  if (!secret || !configuredOrigin) return jsonError('CONFIGURATION_INVALID', 'Operator session is not configured.', 503);
  if (request.method !== 'GET' && !csrfToken) return jsonError('CSRF_INVALID', 'CSRF token missing.', 403);
  if (request.method !== 'GET' && !sameOrigin(origin, host, configuredOrigin)) return jsonError('CSRF_INVALID', 'Origin or Host is invalid.', 403);
  if (!verifySession(session, request.method === 'GET' ? null : csrfToken, secret)) return jsonError('UNAUTHORIZED', 'A valid operator session is required.', 401);
  return { csrfToken: csrfToken ?? '' };
}

export function sameOrigin(origin: string | null, host: string | null, configuredOrigin: string): boolean {
  try {
    const expected = new URL(configuredOrigin);
    if (!origin || !host) return false;
    return new URL(origin).origin === expected.origin && host === expected.host;
  } catch {
    return false;
  }
}

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ code, message, retryable: false, correlationId: randomUUID() }, { status });
}
