import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { getRun, listEvents, openDatabase, projectRun } from '@releaseproof/core';

const databasePath = valueFor('--database');
const runId = valueFor('--run');
if (!databasePath || !runId) {
  process.stderr.write('Usage: npm run replay -- --database <sqlite-path> --run <run-id>\n');
  process.exitCode = 1;
} else {
  const database = openDatabase(resolve(databasePath));
  try {
    const run = getRun(database, runId);
    const projection = projectRun(database, runId);
    if (!run || !projection) throw new Error(`Run ${runId} was not found.`);
    const events = listEvents(database, runId, 0, 10_000);
    const contiguous = events.every((event, index) => event.sequence === index + 1);
    const artifact = { run: projection, events, contiguousSequence: contiguous };
    const canonical = JSON.stringify(artifact);
    process.stdout.write(`${JSON.stringify({ replayHash: createHash('sha256').update(canonical).digest('hex'), ...artifact }, null, 2)}\n`);
    if (!contiguous) process.exitCode = 2;
  } finally {
    database.close();
  }
}

function valueFor(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
