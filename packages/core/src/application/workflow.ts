import { randomBytes, randomUUID } from 'node:crypto';
import type { EnvironmentRegistry, Manifest, SlackInteraction } from '@releaseproof/contracts';
import { APPROVAL_ACTION_ID, approvalStillValid, validateSlackApproval, type ApprovalRecord } from '../domain/approval.js';
import { evaluateRequiredChecks } from '../domain/checks.js';
import { fingerprintEnvironment } from '../domain/environment.js';
import { buildManifest, canonicalizeManifest, githubEffectKey, hashManifest, linearCommentEffectKey, linearStateEffectKey, slackApprovalEffectKey, slackFinalEffectKey } from '../domain/manifest.js';
import { gatherAndPropose } from '../agent/planner.js';
import type { CommandRow, ReleaseProofDatabase } from '../persistence/database.js';
import { advanceGathering } from '../persistence/database.js';
import {
  appendEvent,
  bindApprovalMessage,
  completeOperation,
  createApprovalIntent,
  EffectConflictError,
  enqueueCommand,
  getApprovalByIntent,
  getLatestApproval,
  getManifest,
  getRun,
  listUnsettledOperations,
  markOperationSent,
  markOperationUnknown,
  persistManifest,
  recordApprovalDecision,
  recordObservation,
  reserveOperation,
  updateRun
} from '../persistence/runs.js';
import type { Clock, GitHubPort, LinearPort, ModelPort, SlackPort } from '../providers/ports.js';

export type WorkflowPorts = {
  github: GitHubPort;
  linear: LinearPort;
  slack: SlackPort;
  model: ModelPort;
  clock: Clock;
  environment: EnvironmentRegistry;
};

export async function handleCommand(database: ReleaseProofDatabase, command: CommandRow, ports?: WorkflowPorts): Promise<void> {
  if (command.expected_version !== null && command.expected_version !== undefined) {
    const run = requireRun(database, command.run_id);
    if (run.version !== command.expected_version) {
      database.transaction(() => {
        database.prepare("UPDATE commands SET status = 'rejected', error_code = 'VERSION_CONFLICT' WHERE id = ?").run(command.id);
        appendEvent(database, command.run_id, 'CommandRejected', 'worker', command.id, { code: 'VERSION_CONFLICT', expectedVersion: command.expected_version, actualVersion: run.version });
      })();
      return;
    }
  }
  if (command.kind === 'prepare_run') {
    advanceGathering(database, command);
    if (ports) enqueueCommand(database, command.run_id, 'plan_run', { dedupe: 'plan' });
    return;
  }
  if (!ports) return;
  if (command.kind === 'plan_run' || command.kind === 'replan_run') await planRun(database, command, ports);
  else if (command.kind === 'retry_run') {
    const run = requireRun(database, command.run_id);
    const unsettled = listUnsettledOperations(database, run.id)[0];
    if (unsettled?.kind === 'slack.approval') enqueueCommand(database, run.id, 'request_approval', { dedupe: `retry:${unsettled.id}` });
    else if (unsettled?.kind === 'slack.final') enqueueCommand(database, run.id, 'execute_slack', { dedupe: `retry:${unsettled.id}` });
    else if (run.phase === 'publishing') enqueueCommand(database, run.id, 'execute_github', { dedupe: `retry:${run.version}` });
    else if (run.phase === 'updating_apps') enqueueCommand(database, run.id, 'execute_linear', { dedupe: `retry:${run.version}` });
    else enqueueCommand(database, run.id, 'verify_run', { dedupe: `retry:${run.version}` });
  }
  else if (command.kind === 'request_approval') await requestApproval(database, command, ports);
  else if (command.kind === 'apply_approval') await applyApproval(database, command, ports);
  else if (command.kind === 'execute_github') await executeGithub(database, command, ports);
  else if (command.kind === 'execute_linear') await executeLinear(database, command, ports);
  else if (command.kind === 'execute_slack') await executeSlack(database, command, ports);
  else if (command.kind === 'verify_run') await verifyRun(database, command, ports);
  else if (command.kind === 'cancel_run') {
    updateRun(database, command.run_id, { status: 'cancelled' });
    appendEvent(database, command.run_id, 'RunCancelled', 'operator', command.id, {});
  }
}

export function ingestApproval(database: ReleaseProofDatabase, interaction: SlackInteraction, ports: WorkflowPorts): { duplicate: boolean; accepted: boolean; code?: string; message: string } {
  const approvalRow = getApprovalByIntent(database, interaction.intentId);
  if (!approvalRow || !approvalRow.intent_id || !approvalRow.team_id || !approvalRow.channel_id || !approvalRow.message_ts) {
    return { duplicate: false, accepted: false, code: 'INVALID_REQUEST', message: 'No matching approval intent.' };
  }
  const manifest = getManifest(database, approvalRow.manifest_id);
  if (!manifest) return { duplicate: false, accepted: false, code: 'INVALID_REQUEST', message: 'Approval is not bound to a persisted manifest.' };
  const record: ApprovalRecord = {
    intentId: approvalRow.intent_id,
    manifestHash: manifest.hash,
    nonce: approvalRow.intent_nonce,
    teamId: approvalRow.team_id,
    channelId: approvalRow.channel_id,
    messageTs: approvalRow.message_ts,
    reviewerUserIds: ports.environment.slack.reviewerUserIds,
    expiresAt: approvalRow.expires_at,
    decision: approvalRow.decision as ApprovalRecord['decision']
  };
  const validation = validateSlackApproval({ interaction, approval: record, expectedAppId: ports.environment.slack.appId, now: ports.clock.now() });
  if (!validation.ok) {
    database.transaction(() => {
      appendEvent(database, approvalRow.run_id, 'ApprovalRejected', 'slack', interaction.transportDedupeKey, { reason: validation.reason, code: validation.code });
    })();
    return { duplicate: false, accepted: false, code: validation.code, message: validation.reason };
  }
  const captured = database.transaction(() => recordApprovalDecision(database, {
    intentId: interaction.intentId,
    decision: 'approved',
    reviewerUserId: interaction.userId,
    actionId: interaction.actionId,
    transportDedupeKey: interaction.transportDedupeKey
  }))();
  if (captured.duplicate) return { duplicate: true, accepted: true, message: 'Approval already captured.' };
  database.transaction(() => {
    updateRun(database, approvalRow.run_id, { status: 'active', phase: 'awaiting_approval' });
    appendEvent(database, approvalRow.run_id, 'ApprovalAccepted', 'slack', interaction.transportDedupeKey, { reviewerUserId: interaction.userId, manifestHash: manifest.hash });
    enqueueCommand(database, approvalRow.run_id, 'apply_approval', { dedupe: captured.approval.id });
  })();
  return { duplicate: false, accepted: true, message: 'Approval captured.' };
}

async function planRun(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  if (run.environment_fingerprint && run.environment_fingerprint !== fingerprintEnvironment(ports.environment)) {
    fail(database, command, 'CONFIGURATION_INVALID', 'Environment fingerprint no longer matches this run.');
    return;
  }
  const result = await gatherAndPropose({
    environment: ports.environment,
    issueIdentifier: run.issue_identifier ?? JSON.parse(command.payload_json).issueIdentifier,
    releaseIntent: run.release_intent ?? JSON.parse(command.payload_json).releaseIntent,
    github: ports.github,
    linear: ports.linear,
    model: ports.model,
    now: ports.clock.now()
  });
  if (result.kind === 'invalid') {
    fail(database, command, 'PLANNER_INVALID', result.reason);
    return;
  }
  const manifest = buildManifest({ environment: ports.environment, proposal: result.proposal, releaseBody: result.proposal.releaseBody });
  const canonical = canonicalizeManifest(manifest);
  const hash = hashManifest(manifest);
  database.transaction(() => {
    const stored = persistManifest(database, manifest, canonical, hash, result.proposal.releaseBody);
    updateRun(database, run.id, { phase: 'planned', status: 'active', manifest_id: stored.id, planner_error: null });
    appendEvent(database, run.id, 'ManifestFrozen', 'worker', command.id, { manifestHash: hash, commitSha: manifest.commitSha, tagName: manifest.tagName });
    enqueueCommand(database, run.id, 'request_approval', { dedupe: stored.id });
  })();
}

async function requestApproval(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  const manifestRow = requireManifest(database, run.manifest_id);
  const manifest = JSON.parse(manifestRow.canonical_json) as Manifest;
  const existingApproval = getLatestApproval(database, run.id);
  if (existingApproval?.manifest_id === manifestRow.id) {
    if (existingApproval.message_ts && existingApproval.channel_id) {
      database.transaction(() => updateRun(database, run.id, { phase: 'awaiting_approval', status: 'waiting_for_approval', planner_error: null }))();
      return;
    }
    const operation = database.transaction(() => reserveOperation(database, {
      runId: run.id, manifestId: manifestRow.id, environmentId: run.environment_id, kind: 'slack.approval',
      targetKey: existingApproval.intent_id ?? '', effectKey: slackApprovalEffectKey(run.environment_id, run.id)
    }))();
    const marker = `rp-approval:${existingApproval.intent_id}:${existingApproval.intent_nonce}`;
    const found = await ports.slack.findMessage(manifest.slackChannelId, marker);
    if (found.kind === 'observed' && found.value) {
      database.transaction(() => {
        bindApprovalMessage(database, existingApproval.intent_id ?? '', found.value!.channelId, found.value!.ts);
        completeOperation(database, operation.id, 'verified', found.value!.ts);
        recordObservation(database, { runId: run.id, provider: 'slack', mode: ports.slack.mode, objectId: found.value!.ts, data: { kind: 'approval-message', ...found.value, intentId: existingApproval.intent_id } });
        updateRun(database, run.id, { phase: 'awaiting_approval', status: 'waiting_for_approval', planner_error: null });
        appendEvent(database, run.id, 'ApprovalRequestedRecovered', 'worker', command.id, { intentId: existingApproval.intent_id, messageTs: found.value!.ts });
      })();
      return;
    }
    deferSlackApprovalReconciliation(database, command, run.id, operation.id, 'Slack approval post may have succeeded, but its marker is not yet observable.');
    return;
  }
  const intentId = randomUUID();
  const nonce = randomBytes(16).toString('hex');
  const marker = `rp-approval:${intentId}:${nonce}`;
  const text = [
    '*ReleaseProof approval required*',
    `Repository: ${manifest.repositoryFullName}`,
    `Prerelease: ${manifest.tagName}`,
    `Commit: ${manifest.commitSha}`,
    `Linear issues: ${manifest.issues.map((issue) => issue.issueId).join(', ')}`,
    `Required checks: ${manifest.requiredChecks.map((check) => `${check.name} (${check.appId})`).join(', ')}`,
    `Manifest: ${manifestRow.hash}`,
    marker
  ].join('\n');
  const operation = database.transaction(() => {
    const reserved = reserveOperation(database, {
      runId: run.id,
      manifestId: manifestRow.id,
      environmentId: run.environment_id,
      kind: 'slack.approval',
      targetKey: intentId,
      effectKey: slackApprovalEffectKey(run.environment_id, run.id)
    });
    createApprovalIntent(database, {
      runId: run.id,
      manifestId: manifestRow.id,
      intentId,
      nonce,
      teamId: manifest.slackTeamId,
      channelId: manifest.slackChannelId,
      messageTs: '',
      expiresAt: new Date(ports.clock.now().getTime() + 30 * 60_000).toISOString()
    });
    return reserved;
  })();
  database.transaction(() => markOperationSent(database, operation.id))();
  const posted = await ports.slack.postMessage(manifest.slackChannelId, text, { intentId, nonce, actionId: APPROVAL_ACTION_ID });
  if (posted.kind !== 'observed') {
    if (posted.kind === 'rejected') {
      completeOperation(database, operation.id, 'rejected', null);
      fail(database, command, posted.code, 'Slack rejected the approval message.');
      return;
    }
    const found = await ports.slack.findMessage(manifest.slackChannelId, marker);
    if (found.kind === 'observed' && found.value) {
      database.transaction(() => {
        bindApprovalMessage(database, intentId, found.value!.channelId, found.value!.ts);
        completeOperation(database, operation.id, 'verified', found.value!.ts);
        recordObservation(database, { runId: run.id, provider: 'slack', mode: ports.slack.mode, objectId: found.value!.ts, data: { kind: 'approval-message', ...found.value, intentId } });
        updateRun(database, run.id, { phase: 'awaiting_approval', status: 'waiting_for_approval' });
        appendEvent(database, run.id, 'ApprovalRequestedRecovered', 'worker', command.id, { intentId, messageTs: found.value!.ts });
      })();
      return;
    }
    deferSlackApprovalReconciliation(database, command, run.id, operation.id, 'Slack approval response was lost; waiting to reconcile its immutable marker.');
    return;
  }
  database.transaction(() => {
    bindApprovalMessage(database, intentId, posted.value.channelId, posted.value.ts);
    completeOperation(database, operation.id, 'verified', posted.value.ts);
    recordObservation(database, { runId: run.id, provider: 'slack', mode: ports.slack.mode, objectId: posted.value.ts, data: { kind: 'approval-message', ...posted.value, intentId } });
    updateRun(database, run.id, { phase: 'awaiting_approval', status: 'waiting_for_approval' });
    appendEvent(database, run.id, 'ApprovalRequested', 'worker', command.id, { intentId, messageTs: posted.value.ts });
  })();
}

function deferSlackApprovalReconciliation(database: ReleaseProofDatabase, command: CommandRow, runId: string, operationId: string, reason: string): void {
  database.transaction(() => {
    markOperationUnknown(database, operationId);
    updateRun(database, runId, { phase: 'planned', status: 'reconciling', planner_error: reason });
    appendEvent(database, runId, 'SlackApprovalReconciliationRequired', 'worker', command.id, { operationId, reason });
    database.prepare("UPDATE commands SET error_code = 'PROVIDER_UNKNOWN' WHERE id = ?").run(command.id);
  })();
}

async function applyApproval(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  const approval = getLatestApproval(database, run.id);
  const manifestRow = requireManifest(database, run.manifest_id);
  if (!approval || approval.decision !== 'approved') {
    fail(database, command, 'APPROVAL_REQUIRED', 'No accepted approval is bound to this run.');
    return;
  }
  if (!approvalStillValid({
    intentId: approval.intent_id ?? '',
    manifestHash: manifestRow.hash,
    nonce: approval.intent_nonce,
    teamId: approval.team_id ?? '',
    channelId: approval.channel_id ?? '',
    messageTs: approval.message_ts ?? '',
    reviewerUserIds: ports.environment.slack.reviewerUserIds,
    expiresAt: approval.expires_at,
    decision: approval.decision as ApprovalRecord['decision']
  }, ports.clock.now())) {
    fail(database, command, 'APPROVAL_EXPIRED', 'Approval expired before execution.');
    return;
  }
  database.transaction(() => {
    updateRun(database, run.id, { phase: 'publishing', status: 'active' });
    enqueueCommand(database, run.id, 'execute_github', { dedupe: manifestRow.id });
  })();
}

async function executeGithub(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  const manifestRow = requireManifest(database, run.manifest_id);
  const manifest = JSON.parse(manifestRow.canonical_json) as Manifest;
  const approval = getLatestApproval(database, run.id);
  if (!approval || approval.decision !== 'approved' || approval.manifest_id !== manifestRow.id) {
    fail(database, command, 'APPROVAL_REQUIRED', 'Execution requires an approval bound to the current manifest.');
    return;
  }
  if (!approvalStillValid({
    intentId: approval.intent_id ?? '',
    manifestHash: manifestRow.hash,
    nonce: approval.intent_nonce,
    teamId: approval.team_id ?? '',
    channelId: approval.channel_id ?? '',
    messageTs: approval.message_ts ?? '',
    reviewerUserIds: ports.environment.slack.reviewerUserIds,
    expiresAt: approval.expires_at,
    decision: 'approved'
  }, ports.clock.now())) {
    fail(database, command, 'APPROVAL_EXPIRED', 'Approval expired before GitHub publication.');
    return;
  }
  if (fingerprintEnvironment(ports.environment) !== manifest.environmentFingerprint) {
    fail(database, command, 'CONFIGURATION_INVALID', 'Environment fingerprint does not match the approved manifest.');
    return;
  }
  if (ports.environment.repositoryFullName !== manifest.repositoryFullName || ports.environment.repositoryId !== manifest.repositoryId) {
    fail(database, command, 'TARGET_CONFLICT', 'Repository identity does not match the approved manifest.');
    return;
  }

  const checks = await ports.github.readChecks(manifest.commitSha);
  if (checks.kind !== 'observed') {
    fail(database, command, 'CHECK_EVIDENCE_INVALID', 'Required check evidence could not be observed.');
    return;
  }
  const checkResult = evaluateRequiredChecks(manifest, checks.value);
  if (!checkResult.ok) {
    fail(database, command, 'CHECK_EVIDENCE_INVALID', checkResult.reason);
    return;
  }

  const existingTag = await ports.github.resolveTagCommit(manifest.tagName);
  if (existingTag.kind === 'rejected' || existingTag.kind === 'unknown') {
    fail(database, command, 'TARGET_CONFLICT', 'Existing tag could not be resolved safely.');
    return;
  }
  if (existingTag.kind === 'observed' && existingTag.value && existingTag.value !== manifest.commitSha) {
    fail(database, command, 'TARGET_CONFLICT', 'Existing tag points at a different commit than the approved SHA.');
    return;
  }

  let operation;
  try {
    operation = database.transaction(() => reserveOperation(database, {
      runId: run.id,
      manifestId: manifestRow.id,
      environmentId: run.environment_id,
      kind: 'github.release',
      targetKey: manifest.tagName,
      effectKey: githubEffectKey(run.environment_id, manifest.repositoryFullName, manifest.tagName)
    }))();
  } catch (error) {
    if (error instanceof EffectConflictError) {
      fail(database, command, 'TARGET_CONFLICT', error.message);
      return;
    }
    throw error;
  }

  const marker = `rp-receipt:${operation.id}:${manifestRow.hash}`;
  const reconciled = await reconcileGithubRelease(ports.github, manifest, marker);
  if (reconciled.kind === 'verified') {
    finalizeGithubOperation(database, command, ports, run.id, operation.id, reconciled.release, reconciled.sha);
    return;
  }
  if (operation.status !== 'reserved') {
    deferGithubReconciliation(database, command, run.id, operation.id, reconciled.reason);
    return;
  }
  if (reconciled.kind === 'conflict') {
    completeOperation(database, operation.id, 'rejected', null);
    fail(database, command, 'TARGET_CONFLICT', reconciled.reason);
    return;
  }
  const body = `${manifestRow.release_body}\n\n${marker}`;
  database.transaction(() => markOperationSent(database, operation.id))();
  const created = await ports.github.createPrerelease({ tagName: manifest.tagName, commitSha: manifest.commitSha, name: manifest.releaseTitle, body });
  if (created.kind !== 'observed') {
    if (created.kind === 'unknown') {
      deferGithubReconciliation(database, command, run.id, operation.id, 'GitHub response was lost after a reserved publication attempt.');
      return;
    }
    completeOperation(database, operation.id, 'rejected', null);
    fail(database, command, created.kind === 'rejected' ? created.code : 'PROVIDER_UNKNOWN', 'GitHub publication was rejected.');
    return;
  }
  const readback = await reconcileGithubRelease(ports.github, manifest, marker);
  if (readback.kind === 'verified') {
    finalizeGithubOperation(database, command, ports, run.id, operation.id, readback.release, readback.sha);
    return;
  }
  deferGithubReconciliation(database, command, run.id, operation.id, readback.reason);
}

type GitHubReconciliation =
  | { kind: 'verified'; release: { id: string; tagName: string; targetCommitish: string; name: string; body: string; prerelease: boolean; htmlUrl: string }; sha: string }
  | { kind: 'pending'; reason: string }
  | { kind: 'conflict'; reason: string };

async function reconcileGithubRelease(github: GitHubPort, manifest: Manifest, marker: string): Promise<GitHubReconciliation> {
  const [tag, release] = await Promise.all([github.resolveTagCommit(manifest.tagName), github.readReleaseByTag(manifest.tagName)]);
  if (tag.kind !== 'observed' || release.kind !== 'observed') return { kind: 'pending', reason: 'GitHub readback is unavailable; no repeat write will be attempted.' };
  if (tag.value && tag.value !== manifest.commitSha) return { kind: 'conflict', reason: 'Existing tag points at a different commit than the approved SHA.' };
  if (!tag.value && !release.value) return { kind: 'pending', reason: 'No matching GitHub release is currently observable.' };
  if (!tag.value || !release.value) return { kind: 'conflict', reason: 'GitHub tag and release disagree; manual investigation is required.' };
  if (release.value.tagName !== manifest.tagName || release.value.targetCommitish !== manifest.commitSha || release.value.name !== manifest.releaseTitle || !release.value.prerelease || !release.value.body.includes(marker)) {
    return { kind: 'conflict', reason: 'Existing GitHub release is not the exact approved ReleaseProof effect.' };
  }
  return { kind: 'verified', release: release.value, sha: tag.value };
}

function finalizeGithubOperation(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts, runId: string, operationId: string, release: { id: string; tagName: string; targetCommitish: string; name: string; body: string; prerelease: boolean; htmlUrl: string }, sha: string): void {
  database.transaction(() => {
    completeOperation(database, operationId, 'verified', release.id);
    recordObservation(database, { runId, provider: 'github', mode: ports.github.mode, objectId: release.id, data: { ...release, resolvedSha: sha } });
    updateRun(database, runId, { phase: 'updating_apps', status: 'active' });
    appendEvent(database, runId, 'GitHubReleaseObserved', 'worker', command.id, { releaseId: release.id, sha });
    enqueueCommand(database, runId, 'execute_linear', { dedupe: operationId });
  })();
}

function deferGithubReconciliation(database: ReleaseProofDatabase, command: CommandRow, runId: string, operationId: string, reason: string): void {
  database.transaction(() => {
    markOperationUnknown(database, operationId);
    updateRun(database, runId, { phase: 'publishing', status: 'reconciling', planner_error: reason });
    appendEvent(database, runId, 'GitHubReconciliationRequired', 'worker', command.id, { operationId, reason });
    database.prepare("UPDATE commands SET error_code = 'PROVIDER_UNKNOWN' WHERE id = ?").run(command.id);
  })();
}

async function executeLinear(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  const manifestRow = requireManifest(database, run.manifest_id);
  const manifest = JSON.parse(manifestRow.canonical_json) as Manifest;
  const issueRef = manifest.issues[0];
  if (!issueRef) {
    fail(database, command, 'INVALID_REQUEST', 'Manifest does not name a Linear issue.');
    return;
  }
  const issue = await ports.linear.readIssue(issueRef.issueId);
  if (issue.kind !== 'observed' || issue.value.teamId !== manifest.linearTeamId) {
    fail(database, command, 'TARGET_CONFLICT', 'Linear issue is not in the approved team.');
    return;
  }
  const stateOp = database.transaction(() => reserveOperation(database, {
    runId: run.id,
    manifestId: manifestRow.id,
    environmentId: run.environment_id,
    kind: 'linear.state',
    targetKey: issueRef.issueId,
    effectKey: linearStateEffectKey(run.environment_id, issueRef.issueId)
  }))();
  const commentOp = database.transaction(() => reserveOperation(database, {
    runId: run.id,
    manifestId: manifestRow.id,
    environmentId: run.environment_id,
    kind: 'linear.comment',
    targetKey: issueRef.issueId,
    effectKey: linearCommentEffectKey(run.environment_id, issueRef.issueId)
  }))();
  const marker = `rp-receipt:${commentOp.id}:${manifestRow.hash}`;
  let currentIssue = issue.value;
  if (currentIssue.stateId !== issueRef.releasedStateId) {
    if (stateOp.status !== 'reserved') {
      deferLinearReconciliation(database, command, run.id, stateOp.id, 'Linear state update was previously sent but is not yet observable.');
      return;
    }
    database.transaction(() => markOperationSent(database, stateOp.id))();
    const updated = await ports.linear.updateIssueState(issueRef.issueId, issueRef.releasedStateId);
    if (updated.kind !== 'observed') {
      if (updated.kind === 'unknown') {
        deferLinearReconciliation(database, command, run.id, stateOp.id, 'Linear state update response was lost after a reserved write.');
        return;
      }
      completeOperation(database, stateOp.id, 'rejected', null);
      fail(database, command, updated.kind === 'rejected' ? updated.code : 'PROVIDER_UNKNOWN', 'Linear state update was rejected.');
      return;
    }
    const readback = await ports.linear.readIssue(issueRef.issueId);
    if (readback.kind !== 'observed' || readback.value.stateId !== issueRef.releasedStateId) {
      deferLinearReconciliation(database, command, run.id, stateOp.id, 'Linear state update readback is unavailable or inconsistent.');
      return;
    }
    currentIssue = readback.value;
  }
  if (!currentIssue.comments.some((item) => item.body.includes(marker))) {
    if (commentOp.status !== 'reserved') {
      deferLinearReconciliation(database, command, run.id, commentOp.id, 'Linear receipt comment was previously sent but is not yet observable.');
      return;
    }
    database.transaction(() => markOperationSent(database, commentOp.id))();
    const comment = await ports.linear.createReceiptComment(issueRef.issueId, `ReleaseProof completed ${manifest.tagName} at ${manifest.commitSha}. ${marker}`);
    if (comment.kind !== 'observed') {
      if (comment.kind === 'unknown') {
        deferLinearReconciliation(database, command, run.id, commentOp.id, 'Linear receipt comment response was lost after a reserved write.');
        return;
      }
      completeOperation(database, commentOp.id, 'rejected', null);
      fail(database, command, comment.kind === 'rejected' ? comment.code : 'PROVIDER_UNKNOWN', 'Linear receipt comment was rejected.');
      return;
    }
    const readback = await ports.linear.readIssue(issueRef.issueId);
    if (readback.kind !== 'observed') {
      deferLinearReconciliation(database, command, run.id, commentOp.id, 'Linear receipt comment readback is unavailable.');
      return;
    }
    currentIssue = readback.value;
  }
  if (currentIssue.stateId !== issueRef.releasedStateId) {
    deferLinearReconciliation(database, command, run.id, commentOp.id, 'Linear readback is unavailable or inconsistent.');
    return;
  }
  const observedComment = currentIssue.comments.find((item) => item.body.includes(marker));
  if (!observedComment) {
    deferLinearReconciliation(database, command, run.id, commentOp.id, 'Linear receipt comment is not yet observable.');
    return;
  }
  database.transaction(() => {
    completeOperation(database, stateOp.id, 'verified', currentIssue.stateId);
    completeOperation(database, commentOp.id, 'verified', observedComment.id);
    recordObservation(database, { runId: run.id, provider: 'linear', mode: ports.linear.mode, objectId: currentIssue.id, data: currentIssue });
    appendEvent(database, run.id, 'LinearUpdated', 'worker', command.id, { issueId: currentIssue.id, stateId: currentIssue.stateId });
    enqueueCommand(database, run.id, 'execute_slack', { dedupe: commentOp.id });
  })();
}

function deferLinearReconciliation(database: ReleaseProofDatabase, command: CommandRow, runId: string, operationId: string, reason: string): void {
  database.transaction(() => {
    markOperationUnknown(database, operationId);
    updateRun(database, runId, { phase: 'updating_apps', status: 'reconciling', planner_error: reason });
    appendEvent(database, runId, 'LinearReconciliationRequired', 'worker', command.id, { operationId, reason });
    database.prepare("UPDATE commands SET error_code = 'PROVIDER_UNKNOWN' WHERE id = ?").run(command.id);
  })();
}

async function executeSlack(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  const approval = getLatestApproval(database, run.id);
  const manifestRow = requireManifest(database, run.manifest_id);
  const manifest = JSON.parse(manifestRow.canonical_json) as Manifest;
  if (!approval?.message_ts || !approval.channel_id) {
    fail(database, command, 'PROVIDER_UNKNOWN', 'Missing Slack approval message to update.');
    return;
  }
  const op = database.transaction(() => reserveOperation(database, {
    runId: run.id,
    manifestId: manifestRow.id,
    environmentId: run.environment_id,
    kind: 'slack.final',
    targetKey: approval.message_ts ?? '',
    effectKey: slackFinalEffectKey(run.environment_id, run.id)
  }))();
  const text = `ReleaseProof receipt ${manifest.tagName} at ${manifest.commitSha} is complete. rp-receipt:${op.id}:${manifestRow.hash}`;
  const before = await ports.slack.readMessage(approval.channel_id, approval.message_ts);
  if (before.kind === 'observed' && before.value?.text.includes(`rp-receipt:${op.id}:${manifestRow.hash}`)) {
    finalizeSlackOperation(database, command, ports, run.id, op.id, before.value);
    return;
  }
  if (op.status !== 'reserved') {
    deferSlackReconciliation(database, command, run.id, op.id, 'Slack receipt update was previously sent but is not yet observable.');
    return;
  }
  database.transaction(() => markOperationSent(database, op.id))();
  const updated = await ports.slack.updateMessage(approval.channel_id, approval.message_ts, text);
  const readback = await ports.slack.readMessage(approval.channel_id, approval.message_ts);
  if (readback.kind === 'observed' && readback.value?.text.includes(`rp-receipt:${op.id}:${manifestRow.hash}`)) {
    finalizeSlackOperation(database, command, ports, run.id, op.id, readback.value);
    return;
  }
  if (updated.kind === 'rejected') {
    completeOperation(database, op.id, 'rejected', null);
    fail(database, command, updated.code, 'Slack receipt update was rejected.');
    return;
  }
  deferSlackReconciliation(database, command, run.id, op.id, 'Slack receipt update readback is unavailable; no repeat update will be attempted.');
}

function finalizeSlackOperation(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts, runId: string, operationId: string, message: { channelId: string; ts: string; text: string }): void {
  database.transaction(() => {
    completeOperation(database, operationId, 'verified', message.ts);
    recordObservation(database, { runId, provider: 'slack', mode: ports.slack.mode, objectId: message.ts, data: { final: true, ...message } });
    appendEvent(database, runId, 'SlackReceiptObserved', 'worker', command.id, { ts: message.ts });
    enqueueCommand(database, runId, 'verify_run', { dedupe: operationId });
  })();
}

function deferSlackReconciliation(database: ReleaseProofDatabase, command: CommandRow, runId: string, operationId: string, reason: string): void {
  database.transaction(() => {
    markOperationUnknown(database, operationId);
    updateRun(database, runId, { phase: 'updating_apps', status: 'reconciling', planner_error: reason });
    appendEvent(database, runId, 'SlackReconciliationRequired', 'worker', command.id, { operationId, reason });
    database.prepare("UPDATE commands SET error_code = 'PROVIDER_UNKNOWN' WHERE id = ?").run(command.id);
  })();
}

async function verifyRun(database: ReleaseProofDatabase, command: CommandRow, ports: WorkflowPorts): Promise<void> {
  const run = requireRun(database, command.run_id);
  const manifestRow = requireManifest(database, run.manifest_id);
  const manifest = JSON.parse(manifestRow.canonical_json) as Manifest;
  const release = await ports.github.readReleaseByTag(manifest.tagName);
  const tag = await ports.github.resolveTagCommit(manifest.tagName);
  const issue = await ports.linear.readIssue(manifest.issues[0]?.issueId ?? '');
  const approval = getLatestApproval(database, run.id);
  const slack = approval?.message_ts && approval.channel_id ? await ports.slack.readMessage(approval.channel_id, approval.message_ts) : { kind: 'unknown' as const, reason: 'missing' };
  const complete = release.kind === 'observed' && release.value && tag.kind === 'observed' && tag.value === manifest.commitSha
    && release.value.tagName === manifest.tagName && release.value.name === manifest.releaseTitle && release.value.prerelease
    && release.value.body.includes(manifestRow.hash)
    && issue.kind === 'observed' && issue.value.stateId === manifest.issues[0]?.releasedStateId
    && issue.value.comments.some((comment) => comment.body.includes(manifestRow.hash))
    && slack.kind === 'observed' && slack.value?.text.includes(manifestRow.hash);
  database.transaction(() => {
    updateRun(database, run.id, complete ? { phase: 'complete', status: 'completed' } : { phase: 'verifying', status: 'needs_attention' });
    appendEvent(database, run.id, complete ? 'RunCompleted' : 'RunUnverified', 'worker', command.id, { complete });
  })();
}

function requireRun(database: ReleaseProofDatabase, runId: string) {
  const run = getRun(database, runId);
  if (!run) throw new Error(`Run ${runId} is missing.`);
  return run;
}

function requireManifest(database: ReleaseProofDatabase, manifestId: string | null) {
  if (!manifestId) throw new Error('Run has no immutable manifest.');
  const manifest = getManifest(database, manifestId);
  if (!manifest) throw new Error('Persisted manifest is missing.');
  return manifest;
}

function fail(database: ReleaseProofDatabase, command: CommandRow, code: string, reason: string): void {
  database.transaction(() => {
    updateRun(database, command.run_id, { status: 'needs_attention', planner_error: reason });
    appendEvent(database, command.run_id, 'RunNeedsAttention', 'worker', command.id, { code, reason });
    database.prepare('UPDATE commands SET error_code = ? WHERE id = ?').run(code, command.id);
  })();
}
