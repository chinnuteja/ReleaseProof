import { NextRequest, NextResponse } from 'next/server';
import { readRun } from '../../../../../lib/server/runtime.js';
import { jsonError, requireOperator } from '../../../../../lib/server/operator.js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireOperator(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const projection = readRun(id);
  if (!projection) return jsonError('INVALID_REQUEST', 'Run not found.', 404);
  return NextResponse.json(projection.receipt);
}
