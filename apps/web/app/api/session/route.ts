import { NextRequest, NextResponse } from 'next/server';
import { createSession, sessionCookieName } from '../../../lib/server/session.js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.OPERATOR_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!configuredPassword || !sessionSecret) return NextResponse.json({ code: 'CONFIGURATION_INVALID', message: 'Operator session is not configured.' }, { status: 503 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string' || body.password !== configuredPassword) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Invalid operator credentials.' }, { status: 401 });
  }
  const session = createSession(sessionSecret);
  const response = NextResponse.json({ csrfToken: session.csrfToken });
  response.cookies.set(sessionCookieName(), session.value, { httpOnly: true, sameSite: 'strict', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 8 * 60 * 60 });
  return response;
}
