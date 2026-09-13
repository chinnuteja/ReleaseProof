import { NextResponse } from 'next/server';
import { getWorkerHeartbeat, openDatabase } from '@releaseproof/core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const runtime = 'nodejs';

export async function GET() {
  const databasePath = process.env.DATABASE_PATH ?? join(process.cwd(), 'var', 'releaseproof.sqlite');
  try {
    if (!existsSync(/* turbopackIgnore: true */ databasePath)) return NextResponse.json({ status: 'starting', database: 'not_initialized', worker: null });
    const database = openDatabase(databasePath);
    try {
      return NextResponse.json({ status: 'ok', database: 'available', worker: getWorkerHeartbeat(database) });
    } finally {
      database.close();
    }
  } catch {
    return NextResponse.json({ status: 'unavailable', database: 'unavailable', worker: null }, { status: 503 });
  }
}
