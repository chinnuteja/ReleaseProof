import { NextResponse } from 'next/server';
import { connectionProjection } from '../../../lib/server/connections.js';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ connections: await connectionProjection() });
}
