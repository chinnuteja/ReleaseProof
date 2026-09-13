import { NextRequest, NextResponse } from 'next/server';
import { readEvents, readRun } from '../../../../../lib/server/runtime.js';
import { jsonError, requireOperator } from '../../../../../lib/server/operator.js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireOperator(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  if (!readRun(id)) return jsonError('INVALID_REQUEST', 'Run not found.', 404);
  const after = Number(request.nextUrl.searchParams.get('after') ?? '0');
  return NextResponse.json(readEvents(id, Number.isFinite(after) ? after : 0));
}
