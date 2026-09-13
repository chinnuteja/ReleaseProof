import { createHash } from 'node:crypto';
import { ManifestSchema, type Manifest, type PlannerProposal } from '@releaseproof/contracts';
import { canonicalJson, fingerprintEnvironment } from './environment.js';
import type { EnvironmentRegistry } from '@releaseproof/contracts';

export function hashReleaseBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export function canonicalizeManifest(manifest: Manifest): string {
  const normalized: Manifest = {
    ...manifest,
    issues: [...manifest.issues].sort((left, right) => left.issueId.localeCompare(right.issueId)),
    requiredChecks: [...manifest.requiredChecks].sort((left, right) => {
      const name = left.name.localeCompare(right.name);
      return name !== 0 ? name : left.appId.localeCompare(right.appId);
    })
  };
  return canonicalJson(ManifestSchema.parse(normalized));
}

export function hashManifest(manifest: Manifest): string {
  return createHash('sha256').update(canonicalizeManifest(manifest), 'utf8').digest('hex');
}

export function buildManifest(input: {
  environment: EnvironmentRegistry;
  proposal: PlannerProposal;
  releaseBody: string;
}): Manifest {
  const manifest = ManifestSchema.parse({
    schemaVersion: 1,
    environmentId: input.environment.environmentId,
    environmentFingerprint: fingerprintEnvironment(input.environment),
    repositoryId: input.environment.repositoryId,
    repositoryFullName: input.proposal.repositoryFullName,
    commitSha: input.proposal.commitSha,
    tagName: input.proposal.tagName,
    releaseKind: 'prerelease',
    releaseTitle: input.proposal.releaseTitle,
    releaseBodyHash: hashReleaseBody(input.releaseBody),
    linearTeamId: input.proposal.linearTeamId,
    issues: input.proposal.issues,
    slackTeamId: input.proposal.slackTeamId,
    slackChannelId: input.proposal.slackChannelId,
    requiredChecks: input.proposal.requiredChecks,
    policyVersion: input.environment.policyVersion
  });
  return JSON.parse(canonicalizeManifest(manifest)) as Manifest;
}

export function githubEffectKey(environmentId: string, repositoryFullName: string, tagName: string): string {
  return `github.release:${environmentId}:${repositoryFullName}:${tagName}`;
}

export function linearStateEffectKey(environmentId: string, issueId: string): string {
  return `linear.state:${environmentId}:${issueId}`;
}

export function linearCommentEffectKey(environmentId: string, issueId: string): string {
  return `linear.comment:${environmentId}:${issueId}`;
}

export function slackApprovalEffectKey(environmentId: string, runId: string): string {
  return `slack.approval:${environmentId}:${runId}`;
}

export function slackFinalEffectKey(environmentId: string, runId: string): string {
  return `slack.final:${environmentId}:${runId}`;
}
