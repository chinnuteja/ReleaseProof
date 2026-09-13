import { resolve } from 'node:path';
import { acceptRunRequest, canonicalJson, loadEnvironmentRegistry, openDatabase, projectRun, listEvents, getCommand, enqueueCommand, getRun, type ReleaseProofDatabase } from '@releaseproof/core';
import type { RunRequest } from '@releaseproof/contracts';

export function openAppDatabase(): ReleaseProofDatabase {
  return openDatabase(process.env.DATABASE_PATH ?? resolve(process.cwd(), '../../var/releaseproof.sqlite'));
}

export function createRun(request: RunRequest) {
  const database = openAppDatabase();
  try {
    const mode = process.env.RELEASEPROOF_MODE === 'real_test' ? 'real_test' : 'fixture';
    const loaded = loadEnvironmentRegistry({ mode, path: process.env.RELEASEPROOF_ENVIRONMENT_PATH });
    return acceptRunRequest(database, loaded.environment.environmentId, request, {
      fingerprint: loaded.fingerprint,
      environmentJson: canonicalJson(loaded.environment)
    });
  } finally {
    database.close();
  }
}

export function readRun(runId: string) {
  const database = openAppDatabase();
  try {
    return projectRun(database, runId);
  } finally {
    database.close();
  }
}

export function readEvents(runId: string, after: number) {
  const database = openAppDatabase();
  try {
    const events = listEvents(database, runId, after);
    return { events, next: events.at(-1)?.sequence ?? after };
  } finally {
    database.close();
  }
}

export function readCommand(commandId: string) {
  const database = openAppDatabase();
  try {
    return getCommand(database, commandId);
  } finally {
    database.close();
  }
}

export function queueRunCommand(runId: string, kind: 'cancel_run' | 'retry_run' | 'replan_run', expectedVersion: number, payload: unknown = {}) {
  const database = openAppDatabase();
  try {
    return database.transaction(() => {
      const run = getRun(database, runId);
      if (!run) return null;
      if (run.version !== expectedVersion) return { conflict: true as const };
      return { commandId: enqueueCommand(database, runId, kind, { ...payload as object, dedupe: `${kind}:${expectedVersion}` }, expectedVersion) };
    })();
  } finally {
    database.close();
  }
}
