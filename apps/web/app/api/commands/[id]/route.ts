import { NextRequest, NextResponse } from 'next/server';
import { readCommand } from '../../../../lib/server/runtime.js';
import { jsonError, requireOperator } from '../../../../lib/server/operator.js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireOperator(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const command = readCommand(id);
  if (!command) return jsonError('INVALID_REQUEST', 'Command not found.', 404);
  return NextResponse.json({ id: command.id, runId: command.run_id, kind: command.kind, status: command.status, errorCode: command.error_code ?? null });
}
