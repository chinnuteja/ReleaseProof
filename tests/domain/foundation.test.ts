import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { acceptRunRequest, applyMigrations, assertFixtureUrl, normalizedRead, openDatabase, redactText } from '@releaseproof/core';
import { startFixtureServer } from '../fixtures/fixture-server.js';
import { startWorker } from '../../apps/worker/src/main.js';

const createdDirectories: string[] = [];
afterEach(() => createdDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function testDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'releaseproof-'));
  createdDirectories.push(directory);
  const database = openDatabase(join(directory, 'releaseproof.sqlite'));
  applyMigrations(database, resolve('migrations'));
  return database;
}

describe('P1 durable foundation', () => {
  it('deduplicates equal request keys and rejects changed payloads', () => {
    const database = testDatabase();
    const request = { requestKey: randomUUID(), issueIdentifier: 'REL-1', releaseIntent: 'Publish the approved prerelease.' };
    const first = acceptRunRequest(database, 'fixture', request);
    const second = acceptRunRequest(database, 'fixture', request);
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, run: { id: first.run.id } });
    expect(() => acceptRunRequest(database, 'fixture', { ...request, releaseIntent: 'Different release' })).toThrow('already used');
    database.close();
  });

  it('refuses non-loopback fixture URLs and normalizes fixture errors', async () => {
    expect(() => assertFixtureUrl('https://api.github.com')).toThrow('loopback');
    const fixture = await startFixtureServer();
    try {
      assertFixtureUrl(fixture.baseUrl);
      await expect(normalizedRead({ fetch }, `${fixture.baseUrl}/linear/graphql-error`)).resolves.toMatchObject({ kind: 'rejected', code: 'GRAPHQL_ERRORS' });
      await expect(normalizedRead({ fetch }, `${fixture.baseUrl}/unsupported`)).resolves.toMatchObject({ kind: 'unsupported' });
    } finally {
      await fixture.close();
    }
  });

  it('redacts configured sentinel secrets from text', () => {
    expect(redactText('Authorization: Bearer fixture-secret', ['fixture-secret'])).not.toContain('fixture-secret');
  });

  it('processes a persisted command exactly once across worker restart and rejects a second worker', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'releaseproof-worker-'));
    createdDirectories.push(directory);
    const databasePath = join(directory, 'releaseproof.sqlite');
    const database = openDatabase(databasePath);
    applyMigrations(database, resolve('migrations'));
    const request = { requestKey: randomUUID(), issueIdentifier: 'REL-2', releaseIntent: 'Durable restart check.' };
    const run = acceptRunRequest(database, 'fixture', request).run;
    database.close();

    const stop = await startWorker({ databasePath, migrationsDirectory: resolve('migrations') });
    await expect(startWorker({ databasePath, migrationsDirectory: resolve('migrations') })).rejects.toThrow();
    await stop();
    const afterFirstRun = openDatabase(databasePath);
    expect(afterFirstRun.prepare('SELECT status FROM commands WHERE run_id = ?').get(run.id)).toEqual({ status: 'applied' });
    expect(afterFirstRun.prepare('SELECT COUNT(*) AS count FROM events WHERE run_id = ?').get(run.id)).toEqual({ count: 2 });
    afterFirstRun.close();

    const restartedStop = await startWorker({ databasePath, migrationsDirectory: resolve('migrations') });
    await restartedStop();
    const afterRestart = openDatabase(databasePath);
    expect(afterRestart.prepare('SELECT COUNT(*) AS count FROM events WHERE run_id = ?').get(run.id)).toEqual({ count: 2 });
    afterRestart.close();
  });

  it('rejects a changed migration after it has been applied', () => {
    const directory = mkdtempSync(join(tmpdir(), 'releaseproof-migration-'));
    createdDirectories.push(directory);
    const migrationDirectory = join(directory, 'migrations');
    mkdirSync(migrationDirectory);
    const migrationPath = join(migrationDirectory, '001_initial.sql');
    copyFileSync(resolve('migrations/001_initial.sql'), migrationPath);
    const database = openDatabase(join(directory, 'releaseproof.sqlite'));
    applyMigrations(database, migrationDirectory);
    writeFileSync(migrationPath, `${readFileSync(migrationPath, 'utf8')}\n-- changed`, 'utf8');
    expect(() => applyMigrations(database, migrationDirectory)).toThrow('checksum mismatch');
    database.close();
  });
});
