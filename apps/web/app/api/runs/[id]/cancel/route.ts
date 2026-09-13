import { NextRequest, NextResponse } from 'next/server';
import { queueRunCommand } from '../../../../../lib/server/runtime.js';
import { jsonError, requireOperator } from '../../../../../lib/server/operator.js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireOperator(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { expectedVersion?: number };
  if (!body.expectedVersion) return jsonError('INVALID_REQUEST', 'expectedVersion is required.', 400);
  const result = queueRunCommand(id, 'cancel_run', body.expectedVersion);
  if (!result) return jsonError('INVALID_REQUEST', 'Run not found.', 404);
  if ('conflict' in result) return jsonError('VERSION_CONFLICT', 'Run version conflict.', 409);
  return NextResponse.json({ commandId: result.commandId }, { status: 202 });
}
