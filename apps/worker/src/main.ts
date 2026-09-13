import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceGathering, applyMigrations, claimNextCommand, openDatabase, updateWorkerHeartbeat } from '@releaseproof/core';

const singletonPort = 4319;

export async function acquireWorkerSingleton(): Promise<Server> {
  const server = createServer((_request, response) => {
    response.writeHead(204).end();
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(singletonPort, '127.0.0.1', () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  return server;
}

export async function startWorker(options: { databasePath?: string; migrationsDirectory?: string } = {}): Promise<() => Promise<void>> {
  const singleton = await acquireWorkerSingleton();
  const database = openDatabase(options.databasePath ?? resolve('var/releaseproof.sqlite'));
  applyMigrations(database, options.migrationsDirectory ?? resolve('migrations'));

  const tick = () => {
    updateWorkerHeartbeat(database, process.pid);
    const command = claimNextCommand(database);
    if (command?.kind === 'prepare_run') advanceGathering(database, command);
  };
  tick();
  const interval = setInterval(tick, 250);

  return async () => {
    clearInterval(interval);
    database.close();
    await new Promise<void>((resolvePromise, rejectPromise) => singleton.close((error) => error ? rejectPromise(error) : resolvePromise()));
  };
}

const invokedAsMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsMain) {
  startWorker().then((stop) => {
    const shutdown = () => void stop().finally(() => process.exit(0));
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }).catch((error: unknown) => {
    process.stderr.write(`ReleaseProof worker failed before processing commands: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
