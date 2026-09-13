import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPROVAL_ACTION_ID, APPROVAL_APP_ID, buildManifest, canonicalizeManifest, githubEffectKey, hashManifest, hashReleaseBody, validateSlackApproval } from '@releaseproof/core';
import { parseEnvironmentRegistry } from '@releaseproof/core';
import { SHA_A, SHA_B } from '../fixtures/stateful-server.js';

const environment = parseEnvironmentRegistry({
  environmentId: 'fixture',
  repositoryId: '42',
  repositoryFullName: 'acme/releaseproof-demo',
  github: { mode: 'fixture', baseUrl: 'http://127.0.0.1:9' },
  slack: { mode: 'fixture', baseUrl: 'http://127.0.0.1:9', appId: APPROVAL_APP_ID, teamId: 'T-FIXTURE', channelId: 'C-FIXTURE', reviewerUserIds: ['U-REVIEWER'] },
  linear: { mode: 'fixture', baseUrl: 'http://127.0.0.1:9', teamId: 'TEAM-FIXTURE', releasedStateId: 'STATE-RELEASED' },
  requiredChecks: [{ name: 'ci', appId: 'github-actions' }],
  releaseTagPrefix: 'rp-demo-',
  policyVersion: '2026-09-p2'
});

const proposal = {
  issueId: 'ISSUE-1',
  issueIdentifier: 'REL-1',
  pullRequestNumber: 7,
  repositoryFullName: 'acme/releaseproof-demo',
  commitSha: SHA_A,
  tagName: 'rp-demo-1.0.0-rc.1',
  releaseTitle: 'Release',
  releaseBody: 'Body A',
  requiredChecks: [{ name: 'ci', appId: 'github-actions', headSha: SHA_A }],
  linearTeamId: 'TEAM-FIXTURE',
  issues: [{ issueId: 'ISSUE-1', releasedStateId: 'STATE-RELEASED' }],
  slackTeamId: 'T-FIXTURE',
  slackChannelId: 'C-FIXTURE'
};

describe('P2 authority contracts', () => {
  it('changes the manifest hash when release-critical fields change', () => {
    const first = buildManifest({ environment, proposal, releaseBody: 'Body A' });
    const second = buildManifest({ environment, proposal: { ...proposal, commitSha: SHA_B, requiredChecks: [{ name: 'ci', appId: 'github-actions', headSha: SHA_B }] }, releaseBody: 'Body B' });
    expect(hashManifest(first)).not.toEqual(hashManifest(second));
    expect(hashReleaseBody('Body A')).not.toEqual(hashReleaseBody('Body B'));
    expect(canonicalizeManifest(first)).toContain(SHA_A);
    expect(githubEffectKey('fixture', first.repositoryFullName, first.tagName)).toEqual(githubEffectKey('fixture', second.repositoryFullName, second.tagName));
  });

  it('rejects Slack approvals that do not match the bound identity', () => {
    const approval = {
      intentId: 'intent-1',
      manifestHash: 'abc',
      nonce: 'nonce-1',
      teamId: 'T-FIXTURE',
      channelId: 'C-FIXTURE',
      messageTs: '1.1',
      reviewerUserIds: ['U-REVIEWER'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      decision: 'pending' as const
    };
    const valid = {
      transportDedupeKey: 'd1',
      appId: APPROVAL_APP_ID,
      teamId: 'T-FIXTURE',
      channelId: 'C-FIXTURE',
      messageTs: '1.1',
      userId: 'U-REVIEWER',
      actionId: APPROVAL_ACTION_ID,
      intentId: 'intent-1',
      nonce: 'nonce-1'
    };
    expect(validateSlackApproval({ interaction: valid, approval, expectedAppId: APPROVAL_APP_ID, now: new Date() }).ok).toBe(true);
    expect(validateSlackApproval({ interaction: { ...valid, userId: 'U-OTHER' }, approval, expectedAppId: APPROVAL_APP_ID, now: new Date() }).ok).toBe(false);
    expect(validateSlackApproval({ interaction: { ...valid, channelId: 'C-OTHER' }, approval, expectedAppId: APPROVAL_APP_ID, now: new Date() }).ok).toBe(false);
    expect(validateSlackApproval({ interaction: { ...valid, nonce: 'wrong' }, approval, expectedAppId: APPROVAL_APP_ID, now: new Date() }).ok).toBe(false);
    expect(validateSlackApproval({ interaction: valid, approval: { ...approval, decision: 'rejected' }, expectedAppId: APPROVAL_APP_ID, now: new Date() }).ok).toBe(false);
    expect(validateSlackApproval({ interaction: valid, approval: { ...approval, decision: 'invalid' }, expectedAppId: APPROVAL_APP_ID, now: new Date() }).ok).toBe(false);
    expect(validateSlackApproval({
      interaction: valid,
      approval: { ...approval, expiresAt: new Date(Date.now() - 1_000).toISOString() },
      expectedAppId: APPROVAL_APP_ID,
      now: new Date()
    }).code).toBe('APPROVAL_EXPIRED');
  });

  it('does not expose a browser approval route', () => {
    expect(existsSync(resolve('apps/web/app/api/approvals'))).toBe(false);
    expect(existsSync(resolve('apps/web/app/api/runs/[id]/approve'))).toBe(false);
  });
});
