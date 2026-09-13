import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CommandStatus, RunPhase, RunRequest, RunStatus } from '@releaseproof/contracts';

export type ReleaseProofDatabase = Database.Database;

export type RunRow = {
  id: string;
  environment_id: string;
  request_key: string;
  request_hash: string;
  phase: RunPhase;
  status: RunStatus;
  version: number;
  manifest_id: string | null;
  environment_fingerprint: string | null;
  environment_json: string | null;
  issue_identifier: string | null;
  release_intent: string | null;
  planner_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CommandRow = {
  id: string;
  run_id: string;
  kind: string;
  status: CommandStatus;
  payload_json: string;
  created_at: string;
  applied_at: string | null;
  expected_version?: number | null;
  error_code?: string | null;
};

const now = () => new Date().toISOString();

export function openDatabase(path: string): ReleaseProofDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.pragma('synchronous = FULL');
  return database;
}

export function applyMigrations(database: ReleaseProofDatabase, migrationsDirectory: string): string[] {
  if (!existsSync(migrationsDirectory)) throw new Error(`Migration directory not found: ${migrationsDirectory}`);
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)');
  const applied = database.prepare('SELECT version, checksum FROM schema_migrations').all() as { version: string; checksum: string }[];
  const appliedByVersion = new Map(applied.map((row) => [row.version, row.checksum]));
  const files = readdirSync(migrationsDirectory).filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file)).sort();
  const newlyApplied: string[] = [];

  for (const file of files) {
    const sql = readFileSync(join(migrationsDirectory, file), 'utf8').replace(/^\uFEFF/, '');
    const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
    const existing = appliedByVersion.get(file);
    if (existing && existing !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
    if (existing) continue;
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations(version, applied_at, checksum) VALUES (?, ?, ?)').run(file, now(), checksum);
    })();
    newlyApplied.push(file);
  }
  return newlyApplied;
}

export function canonicalRequestHash(request: RunRequest): string {
  return createHash('sha256').update(JSON.stringify({ issueIdentifier: request.issueIdentifier, releaseIntent: request.releaseIntent }), 'utf8').digest('hex');
}

export function acceptRunRequest(
  database: ReleaseProofDatabase,
  environmentId: string,
  request: RunRequest,
  options: { fingerprint?: string; environmentJson?: string } = {}
): { run: RunRow; created: boolean } {
  const requestHash = canonicalRequestHash(request);
  const existing = database.prepare('SELECT * FROM runs WHERE environment_id = ? AND request_key = ?').get(environmentId, request.requestKey) as RunRow | undefined;
  if (existing) {
    if (existing.request_hash !== requestHash) throw new RequestKeyConflictError(request.requestKey);
    return { run: existing, created: false };
  }

  const timestamp = now();
  const extras = { fingerprint: options.fingerprint ?? null, environmentJson: options.environmentJson ?? null };
  const run: RunRow = {
    id: randomUUID(),
    environment_id: environmentId,
    request_key: request.requestKey,
    request_hash: requestHash,
    phase: 'requested',
    status: 'active',
    version: 1,
    manifest_id: null,
    environment_fingerprint: extras.fingerprint,
    environment_json: extras.environmentJson,
    issue_identifier: request.issueIdentifier,
    release_intent: request.releaseIntent,
    planner_error: null,
    created_at: timestamp,
    updated_at: timestamp
  };
  const command: CommandRow = { id: randomUUID(), run_id: run.id, kind: 'prepare_run', status: 'queued', payload_json: JSON.stringify(request), created_at: timestamp, applied_at: null };
  database.transaction(() => {
    database.prepare(`INSERT INTO runs(id, environment_id, request_key, request_hash, phase, status, version, created_at, updated_at, environment_fingerprint, environment_json, issue_identifier, release_intent)
      VALUES (@id, @environment_id, @request_key, @request_hash, @phase, @status, @version, @created_at, @updated_at, @environment_fingerprint, @environment_json, @issue_identifier, @release_intent)`).run(run);
    database.prepare('INSERT INTO commands(id, run_id, kind, dedupe_key, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(command.id, command.run_id, command.kind, `run:${run.id}:prepare`, command.payload_json, command.status, command.created_at);
    database.prepare('INSERT INTO events(id, run_id, sequence, kind, actor, correlation_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), run.id, 1, 'RunRequested', 'operator', command.id, command.payload_json, timestamp);
  })();
  return { run, created: true };
}

export function claimNextCommand(database: ReleaseProofDatabase): CommandRow | null {
  return database.transaction(() => {
    const command = database.prepare("SELECT id, run_id, kind, status, payload_json, created_at, applied_at, expected_version, error_code FROM commands WHERE status = 'queued' ORDER BY created_at, id LIMIT 1").get() as CommandRow | undefined;
    if (!command) return null;
    const appliedAt = now();
    const updated = database.prepare("UPDATE commands SET status = 'applied', applied_at = ? WHERE id = ? AND status = 'queued'").run(appliedAt, command.id);
    return updated.changes === 1 ? { ...command, status: 'applied' as const, applied_at: appliedAt } : null;
  })();
}

export function advanceGathering(database: ReleaseProofDatabase, command: CommandRow): void {
  const timestamp = now();
  database.transaction(() => {
    const run = database.prepare('SELECT version FROM runs WHERE id = ?').get(command.run_id) as { version: number } | undefined;
    if (!run) throw new Error(`Run missing for command ${command.id}`);
    database.prepare("UPDATE runs SET phase = 'gathering', status = 'active', version = ?, updated_at = ? WHERE id = ?").run(run.version + 1, timestamp, command.run_id);
    database.prepare('INSERT INTO events(id, run_id, sequence, kind, actor, correlation_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), command.run_id, 2, 'GatheringStarted', 'worker', command.id, '{}', timestamp);
  })();
}

export function updateWorkerHeartbeat(database: ReleaseProofDatabase, processId: number): void {
  database.prepare('INSERT INTO worker_state(singleton_id, heartbeat_at, process_id) VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET heartbeat_at = excluded.heartbeat_at, process_id = excluded.process_id').run(now(), processId);
}

export function getWorkerHeartbeat(database: ReleaseProofDatabase): { heartbeatAt: string; processId: number } | null {
  const result = database.prepare('SELECT heartbeat_at, process_id FROM worker_state WHERE singleton_id = 1').get() as { heartbeat_at: string; process_id: number } | undefined;
  return result ? { heartbeatAt: result.heartbeat_at, processId: result.process_id } : null;
}

export class RequestKeyConflictError extends Error {
  constructor(requestKey: string) {
    super(`The request key ${requestKey} was already used for a different request.`);
    this.name = 'RequestKeyConflictError';
  }
}
