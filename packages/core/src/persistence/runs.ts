import { createHash, randomUUID } from 'node:crypto';
import type { CommandKind, CommandStatus, Manifest, ProviderMode, Receipt, RunPhase, RunProjection, RunStatus } from '@releaseproof/contracts';
import type { ReleaseProofDatabase, RunRow, CommandRow } from './database.js';

export type ManifestRow = { id: string; hash: string; canonical_json: string; release_body: string };
export type ApprovalRow = {
  id: string;
  run_id: string;
  manifest_id: string;
  intent_id: string | null;
  intent_nonce: string;
  decision: string;
  expires_at: string;
  team_id: string | null;
  channel_id: string | null;
  message_ts: string | null;
  reviewer_user_id: string | null;
  created_at: string | null;
  transport_dedupe_key: string | null;
  action_id: string | null;
  reserved_operation_id: string | null;
};
export type OperationRow = {
  id: string;
  run_id: string;
  manifest_id: string | null;
  environment_id: string;
  kind: string;
  target_key: string;
  effect_key: string;
  status: string;
  remote_object_id: string | null;
};
export type AttemptRow = {
  id: string;
  operation_id: string;
  ordinal: number;
  reserved_at: string;
  sent_at: string | null;
  result_kind: string | null;
  completed_at: string | null;
};

const now = () => new Date().toISOString();

export function getRun(database: ReleaseProofDatabase, runId: string): RunRow | undefined {
  return database.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as RunRow | undefined;
}

export function listUnsettledOperations(database: ReleaseProofDatabase, runId: string): OperationRow[] {
  return database.prepare("SELECT * FROM operations WHERE run_id = ? AND status IN ('reserved', 'sent', 'unknown') ORDER BY rowid DESC").all(runId) as OperationRow[];
}

export function getRunByRequestKey(database: ReleaseProofDatabase, environmentId: string, requestKey: string): RunRow | undefined {
  return database.prepare('SELECT * FROM runs WHERE environment_id = ? AND request_key = ?').get(environmentId, requestKey) as RunRow | undefined;
}

export function listEvents(database: ReleaseProofDatabase, runId: string, after = 0, limit = 100): { sequence: number; kind: string; actor: string; payload: unknown; createdAt: string }[] {
  const rows = database.prepare('SELECT sequence, kind, actor, payload_json, created_at FROM events WHERE run_id = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(runId, after, limit) as { sequence: number; kind: string; actor: string; payload_json: string; created_at: string }[];
  return rows.map((row) => ({ sequence: row.sequence, kind: row.kind, actor: row.actor, payload: JSON.parse(row.payload_json) as unknown, createdAt: row.created_at }));
}

export function getCommand(database: ReleaseProofDatabase, commandId: string): CommandRow | undefined {
  return database.prepare('SELECT id, run_id, kind, status, payload_json, created_at, applied_at, expected_version, error_code FROM commands WHERE id = ?').get(commandId) as CommandRow | undefined;
}

export function recordCommandFailure(database: ReleaseProofDatabase, command: CommandRow, reason: string): void {
  database.transaction(() => {
    database.prepare("UPDATE commands SET status = 'rejected', error_code = ? WHERE id = ?").run('WORKER_ERROR', command.id);
    updateRun(database, command.run_id, { status: 'needs_attention', planner_error: reason });
    appendEvent(database, command.run_id, 'CommandFailed', 'worker', command.id, { code: 'WORKER_ERROR', reason });
  })();
}

export function nextSequence(database: ReleaseProofDatabase, runId: string): number {
  const row = database.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events WHERE run_id = ?').get(runId) as { sequence: number };
  return row.sequence + 1;
}

export function appendEvent(database: ReleaseProofDatabase, runId: string, kind: string, actor: string, correlationId: string, payload: unknown): void {
  database.prepare('INSERT INTO events(id, run_id, sequence, kind, actor, correlation_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), runId, nextSequence(database, runId), kind, actor, correlationId, JSON.stringify(payload), now());
}

export function enqueueCommand(database: ReleaseProofDatabase, runId: string, kind: CommandKind, payload: unknown, expectedVersion?: number): string {
  const id = randomUUID();
  const dedupe = `${runId}:${kind}:${createDedupeSuffix(payload)}`;
  database.prepare('INSERT OR IGNORE INTO commands(id, run_id, kind, expected_version, dedupe_key, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, runId, kind, expectedVersion ?? null, dedupe, JSON.stringify(payload), 'queued', now());
  const existing = database.prepare('SELECT id FROM commands WHERE dedupe_key = ?').get(dedupe) as { id: string };
  return existing.id;
}

function createDedupeSuffix(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'dedupe' in payload) return String((payload as { dedupe?: unknown }).dedupe);
  return 'default';
}

export function updateRun(database: ReleaseProofDatabase, runId: string, patch: Partial<Pick<RunRow, 'phase' | 'status' | 'manifest_id'>> & { planner_error?: string | null }): void {
  const run = getRun(database, runId);
  if (!run) throw new Error(`Run ${runId} is missing.`);
  database.prepare('UPDATE runs SET phase = ?, status = ?, version = ?, updated_at = ?, manifest_id = ?, planner_error = ? WHERE id = ?').run(
    patch.phase ?? run.phase,
    patch.status ?? run.status,
    run.version + 1,
    now(),
    patch.manifest_id === undefined ? run.manifest_id : patch.manifest_id,
    patch.planner_error === undefined ? (run as RunRow & { planner_error?: string | null }).planner_error ?? null : patch.planner_error,
    runId
  );
}

export function persistManifest(database: ReleaseProofDatabase, manifest: Manifest, canonicalJson: string, hash: string, releaseBody: string): ManifestRow {
  const existing = database.prepare('SELECT id, hash, canonical_json, release_body FROM manifests WHERE hash = ?').get(hash) as ManifestRow | undefined;
  if (existing) return existing;
  const row: ManifestRow = { id: randomUUID(), hash, canonical_json: canonicalJson, release_body: releaseBody };
  database.prepare('INSERT INTO manifests(id, hash, canonical_json, release_body, created_at) VALUES (?, ?, ?, ?, ?)').run(row.id, row.hash, row.canonical_json, row.release_body, now());
  return row;
}

export function getManifest(database: ReleaseProofDatabase, manifestId: string): ManifestRow | undefined {
  return database.prepare('SELECT id, hash, canonical_json, release_body FROM manifests WHERE id = ?').get(manifestId) as ManifestRow | undefined;
}

export function createApprovalIntent(database: ReleaseProofDatabase, input: {
  runId: string;
  manifestId: string;
  intentId: string;
  nonce: string;
  teamId: string;
  channelId: string;
  messageTs: string;
  expiresAt: string;
}): ApprovalRow {
  const timestamp = now();
  database.prepare(`INSERT INTO approvals(id, run_id, manifest_id, intent_nonce, decision, expires_at, intent_id, team_id, channel_id, message_ts, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`).run(randomUUID(), input.runId, input.manifestId, input.nonce, input.expiresAt, input.intentId, input.teamId, input.channelId, input.messageTs, timestamp);
  return getApprovalByIntent(database, input.intentId)!;
}

export function bindApprovalMessage(database: ReleaseProofDatabase, intentId: string, channelId: string, messageTs: string): ApprovalRow {
  const result = database.prepare("UPDATE approvals SET channel_id = ?, message_ts = ? WHERE intent_id = ? AND decision = 'pending'").run(channelId, messageTs, intentId);
  if (result.changes !== 1) throw new Error('Pending approval intent is missing.');
  return getApprovalByIntent(database, intentId)!;
}

export function getApprovalByIntent(database: ReleaseProofDatabase, intentId: string): ApprovalRow | undefined {
  return database.prepare('SELECT * FROM approvals WHERE intent_id = ?').get(intentId) as ApprovalRow | undefined;
}

export function getLatestApproval(database: ReleaseProofDatabase, runId: string): ApprovalRow | undefined {
  return database.prepare('SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as ApprovalRow | undefined;
}

export function findApprovalByTransport(database: ReleaseProofDatabase, transportDedupeKey: string): ApprovalRow | undefined {
  return database.prepare('SELECT * FROM approvals WHERE transport_dedupe_key = ?').get(transportDedupeKey) as ApprovalRow | undefined;
}

export function recordApprovalDecision(database: ReleaseProofDatabase, input: {
  intentId: string;
  decision: 'approved' | 'invalid';
  reviewerUserId: string;
  actionId: string;
  transportDedupeKey: string;
}): { duplicate: boolean; approval: ApprovalRow } {
  const existingTransport = findApprovalByTransport(database, input.transportDedupeKey);
  if (existingTransport) return { duplicate: true, approval: existingTransport };
  const approval = getApprovalByIntent(database, input.intentId);
  if (!approval) throw new Error('Approval intent is missing.');
  if (approval.decision === 'approved') return { duplicate: true, approval };
  database.prepare('UPDATE approvals SET decision = ?, reviewer_user_id = ?, action_id = ?, transport_dedupe_key = ? WHERE intent_id = ? AND decision = ?').run(
    input.decision,
    input.reviewerUserId,
    input.actionId,
    input.transportDedupeKey,
    input.intentId,
    'pending'
  );
  return { duplicate: false, approval: getApprovalByIntent(database, input.intentId)! };
}

export function reserveOperation(database: ReleaseProofDatabase, input: {
  runId: string;
  manifestId: string;
  environmentId: string;
  kind: string;
  targetKey: string;
  effectKey: string;
}): OperationRow {
  const existing = database.prepare('SELECT * FROM operations WHERE environment_id = ? AND effect_key = ?').get(input.environmentId, input.effectKey) as OperationRow | undefined;
  if (existing && existing.manifest_id && existing.manifest_id !== input.manifestId) {
    throw new EffectConflictError(input.effectKey);
  }
  if (existing) return existing;
  const row: OperationRow = {
    id: randomUUID(),
    run_id: input.runId,
    manifest_id: input.manifestId,
    environment_id: input.environmentId,
    kind: input.kind,
    target_key: input.targetKey,
    effect_key: input.effectKey,
    status: 'reserved',
    remote_object_id: null
  };
  database.prepare('INSERT INTO operations(id, run_id, manifest_id, environment_id, kind, target_key, effect_key, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    row.id, row.run_id, row.manifest_id, row.environment_id, row.kind, row.target_key, row.effect_key, row.status
  );
  database.prepare('INSERT INTO attempts(id, operation_id, ordinal, reserved_at) VALUES (?, ?, 1, ?)').run(randomUUID(), row.id, now());
  return row;
}

export function completeOperation(database: ReleaseProofDatabase, operationId: string, status: string, remoteObjectId: string | null): void {
  database.prepare('UPDATE operations SET status = ?, remote_object_id = ? WHERE id = ?').run(status, remoteObjectId, operationId);
  database.prepare('UPDATE attempts SET result_kind = ?, completed_at = ? WHERE operation_id = ? AND ordinal = (SELECT MAX(ordinal) FROM attempts WHERE operation_id = ?)').run(status, now(), operationId, operationId);
}

export function markOperationSent(database: ReleaseProofDatabase, operationId: string): AttemptRow {
  const operation = database.prepare('SELECT * FROM operations WHERE id = ?').get(operationId) as OperationRow | undefined;
  if (!operation) throw new Error(`Operation ${operationId} is missing.`);
  if (operation.status !== 'reserved') throw new Error(`Operation ${operationId} is ${operation.status}, not reserved for a write.`);
  const attempt = database.prepare('SELECT * FROM attempts WHERE operation_id = ? ORDER BY ordinal DESC LIMIT 1').get(operationId) as AttemptRow | undefined;
  if (!attempt) throw new Error(`Operation ${operationId} has no attempt.`);
  const timestamp = now();
  database.prepare("UPDATE operations SET status = 'sent' WHERE id = ? AND status = 'reserved'").run(operationId);
  database.prepare('UPDATE attempts SET sent_at = ? WHERE id = ? AND sent_at IS NULL').run(timestamp, attempt.id);
  return { ...attempt, sent_at: timestamp };
}

export function markOperationUnknown(database: ReleaseProofDatabase, operationId: string): void {
  database.prepare("UPDATE operations SET status = 'unknown' WHERE id = ? AND status IN ('reserved', 'sent')").run(operationId);
  database.prepare("UPDATE attempts SET result_kind = 'unknown', completed_at = ? WHERE operation_id = ? AND ordinal = (SELECT MAX(ordinal) FROM attempts WHERE operation_id = ?)").run(now(), operationId, operationId);
}

export function recordObservation(database: ReleaseProofDatabase, input: {
  runId: string;
  provider: 'github' | 'slack' | 'linear';
  mode: ProviderMode;
  objectId: string;
  data: unknown;
}): string {
  const id = randomUUID();
  const payload = JSON.stringify(input.data);
  const digest = createHash('sha256').update(payload, 'utf8').digest('hex');
  database.prepare('INSERT INTO observations(id, run_id, provider, mode, object_id, observed_at, normalized_json, payload_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, input.runId, input.provider, input.mode, input.objectId, now(), payload, digest
  );
  return id;
}

export function listObservations(database: ReleaseProofDatabase, runId: string): { provider: string; mode: ProviderMode; objectId: string; data: unknown }[] {
  const rows = database.prepare('SELECT provider, mode, object_id, normalized_json FROM observations WHERE run_id = ? ORDER BY observed_at').all(runId) as { provider: string; mode: ProviderMode; object_id: string; normalized_json: string }[];
  return rows.map((row) => ({ provider: row.provider, mode: row.mode, objectId: row.object_id, data: JSON.parse(row.normalized_json) as unknown }));
}

export function projectRun(database: ReleaseProofDatabase, runId: string): RunProjection | null {
  const run = getRun(database, runId);
  if (!run) return null;
  const manifest = run.manifest_id ? getManifest(database, run.manifest_id) : undefined;
  const approval = getLatestApproval(database, runId);
  const receipt = buildReceipt(database, run, manifest, approval);
  const parsed = manifest ? JSON.parse(manifest.canonical_json) as Manifest : null;
  return {
    runId: run.id,
    environmentId: run.environment_id,
    requestKey: run.request_key,
    issueIdentifier: (run as RunRow & { issue_identifier?: string | null }).issue_identifier ?? null,
    releaseIntent: (run as RunRow & { release_intent?: string | null }).release_intent ?? null,
    phase: run.phase,
    status: run.status,
    version: run.version,
    manifestHash: manifest?.hash ?? null,
    approvedSha: parsed?.commitSha ?? null,
    approval: {
      decision: (approval?.decision as RunProjection['approval']['decision']) ?? 'pending',
      reviewerUserId: approval?.reviewer_user_id ?? null,
      expiresAt: approval?.expires_at ?? null,
      messageTs: approval?.message_ts ?? null
    },
    nextActions: nextActions(run.phase, run.status, approval?.decision),
    plannerError: (run as RunRow & { planner_error?: string | null }).planner_error ?? null,
    receipt
  };
}

export function buildReceipt(database: ReleaseProofDatabase, run: RunRow, manifest: ManifestRow | undefined, approval: ApprovalRow | undefined): Receipt {
  const observations = listObservations(database, run.id);
  const github = observations.find((item) => item.provider === 'github' && isRecord(item.data) && 'tagName' in item.data);
  const linear = observations.find((item) => item.provider === 'linear' && isRecord(item.data) && 'stateId' in item.data);
  const slack = observations.find((item) => item.provider === 'slack' && isRecord(item.data) && 'final' in item.data);
  const parsed = manifest ? JSON.parse(manifest.canonical_json) as Manifest : null;
  const observedSha = github && isRecord(github.data) ? String(github.data.resolvedSha ?? github.data.targetCommitish ?? '') : null;
  const pending: string[] = [];
  if (!github) pending.push('github-release');
  if (!linear) pending.push('linear-state');
  if (!slack) pending.push('slack-final');
  const completed = run.status === 'completed' && pending.length === 0;
  return {
    runId: run.id,
    requestKey: run.request_key,
    issueIdentifier: (run as RunRow & { issue_identifier?: string | null }).issue_identifier ?? null,
    approvedSha: parsed?.commitSha ?? null,
    observedSha,
    reviewerUserId: approval?.reviewer_user_id ?? null,
    manifestHash: manifest?.hash ?? null,
    completed,
    pending,
    outcomes: [
      outcome('github', github, github ? `Observed release ${String(asRecord(github.data).tagName ?? '')}` : 'GitHub release not observed.'),
      outcome('linear', linear, linear ? `Observed Linear state ${String(asRecord(linear.data).stateId ?? '')}` : 'Linear update not observed.'),
      outcome('slack', slack, slack ? 'Observed Slack receipt message.' : 'Slack final state not observed.')
    ]
  };
}

function outcome(provider: Receipt['outcomes'][number]['provider'], observation: { mode: ProviderMode; objectId: string } | undefined, summary: string): Receipt['outcomes'][number] {
  return {
    provider,
    mode: observation?.mode ?? 'fixture',
    status: observation ? 'observed' : 'missing',
    objectId: observation?.objectId ?? null,
    sourceUrl: null,
    summary
  };
}

function nextActions(phase: RunPhase, status: RunStatus, decision?: string): string[] {
  if (status === 'cancelled' || status === 'completed') return [];
  if (phase === 'awaiting_approval' && decision !== 'approved') return ['wait_for_slack_approval', 'cancel'];
  if (status === 'needs_attention') return ['retry', 'cancel'];
  return ['cancel'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export class EffectConflictError extends Error {
  constructor(effectKey: string) {
    super(`An operation is already reserved for ${effectKey} with a different authority.`);
    this.name = 'EffectConflictError';
  }
}

export type { CommandStatus };
