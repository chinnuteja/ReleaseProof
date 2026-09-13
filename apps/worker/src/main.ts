import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyMigrations,
  claimNextCommand,
  handleCommand,
  openDatabase,
  recordCommandFailure,
  updateWorkerHeartbeat,
  type WorkflowPorts
} from '@releaseproof/core';
import { startSlackSocketMode } from './approval-ingress.js';
import { createConfiguredWorkerRuntime } from './runtime.js';

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

export async function startWorker(options: {
  databasePath?: string;
  migrationsDirectory?: string;
  ports?: WorkflowPorts;
  slackAppToken?: string;
} = {}): Promise<() => Promise<void>> {
  const singleton = await acquireWorkerSingleton();
  const database = openDatabase(options.databasePath ?? resolve('var/releaseproof.sqlite'));
  applyMigrations(database, options.migrationsDirectory ?? resolve('migrations'));
  const approvalIngress = options.ports && options.slackAppToken
    ? await startSlackSocketMode({ appToken: options.slackAppToken, database, ports: options.ports })
    : null;
  let busy = false;

  const processOne = async () => {
    if (busy) return;
    busy = true;
    let command = null;
    try {
      updateWorkerHeartbeat(database, process.pid);
      command = claimNextCommand(database);
      if (command) await handleCommand(database, command, options.ports);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (command) recordCommandFailure(database, command, reason);
      else process.stderr.write(`ReleaseProof worker tick failed: ${reason}\n`);
    } finally {
      busy = false;
    }
  };

  await processOne();
  const interval = setInterval(() => {
    void processOne();
  }, 250);

  return async () => {
    clearInterval(interval);
    if (approvalIngress) await approvalIngress.stop();
    database.close();
    await new Promise<void>((resolvePromise, rejectPromise) => singleton.close((error) => error ? rejectPromise(error) : resolvePromise()));
  };
}

const invokedAsMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsMain) {
  const configured = createConfiguredWorkerRuntime(process.env);
  startWorker({
    ports: configured.ports,
    ...(process.env.DATABASE_PATH ? { databasePath: process.env.DATABASE_PATH } : {}),
    ...(configured.slackAppToken ? { slackAppToken: configured.slackAppToken } : {})
  }).then((stop) => {
    const shutdown = () => void stop().finally(() => process.exit(0));
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }).catch((error: unknown) => {
    process.stderr.write(`ReleaseProof worker failed before processing commands: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
