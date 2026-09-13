import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { getRun, listEvents, listObservations, openDatabase, projectRun } from '@releaseproof/core';

const databasePath = valueFor('--database');
const runId = valueFor('--run');
if (!databasePath || !runId) {
  process.stderr.write('Usage: npm run export:evidence -- --database <sqlite-path> --run <run-id>\n');
  process.exitCode = 1;
} else {
  const database = openDatabase(resolve(databasePath));
  try {
    const run = getRun(database, runId);
    const projection = projectRun(database, runId);
    if (!run || !projection) throw new Error(`Run ${runId} was not found.`);
    const evidence = { projection, events: listEvents(database, runId, 0, 10_000), observations: listObservations(database, runId) };
    const canonical = JSON.stringify(evidence);
    process.stdout.write(`${JSON.stringify({ evidenceHash: createHash('sha256').update(canonical).digest('hex'), ...evidence }, null, 2)}\n`);
  } finally {
    database.close();
  }
}

function valueFor(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
