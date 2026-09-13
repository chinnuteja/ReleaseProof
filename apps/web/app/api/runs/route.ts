import { NextRequest, NextResponse } from 'next/server';
import { RunRequestSchema } from '@releaseproof/contracts';
import { RequestKeyConflictError } from '@releaseproof/core';
import { createRun } from '../../../lib/server/runtime.js';
import { jsonError, requireOperator } from '../../../lib/server/operator.js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = requireOperator(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = RunRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('INVALID_REQUEST', 'Run request failed validation.', 400);
  try {
    const result = createRun(parsed.data);
    return NextResponse.json({ runId: result.run.id, created: result.created }, { status: result.created ? 202 : 200 });
  } catch (error) {
    if (error instanceof RequestKeyConflictError) return jsonError('VERSION_CONFLICT', error.message, 409);
    throw error;
  }
}
