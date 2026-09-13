import type { SlackInteraction } from '@releaseproof/contracts';

export const APPROVAL_ACTION_ID = 'releaseproof.approve';
export const APPROVAL_APP_ID = 'A-FIXTURE';

export type ApprovalRecord = {
  intentId: string;
  manifestHash: string;
  nonce: string;
  teamId: string;
  channelId: string;
  messageTs: string;
  reviewerUserIds: readonly string[];
  expiresAt: string;
  decision: 'pending' | 'approved' | 'rejected' | 'expired' | 'invalid';
};

export type ApprovalValidation =
  | { ok: true; decision: 'approved' }
  | { ok: false; code: 'APPROVAL_EXPIRED' | 'UNAUTHORIZED' | 'INVALID_REQUEST'; reason: string };

export function validateSlackApproval(input: {
  interaction: SlackInteraction;
  approval: ApprovalRecord;
  expectedAppId: string;
  now: Date;
}): ApprovalValidation {
  const { interaction, approval } = input;
  if (interaction.appId !== input.expectedAppId) return { ok: false, code: 'UNAUTHORIZED', reason: 'Unexpected Slack application.' };
  if (interaction.teamId !== approval.teamId) return { ok: false, code: 'UNAUTHORIZED', reason: 'Approval is bound to a different Slack team.' };
  if (interaction.channelId !== approval.channelId) return { ok: false, code: 'UNAUTHORIZED', reason: 'Approval is bound to a different Slack channel.' };
  if (interaction.messageTs !== approval.messageTs) return { ok: false, code: 'UNAUTHORIZED', reason: 'Approval is bound to a different Slack message.' };
  if (interaction.actionId !== APPROVAL_ACTION_ID) return { ok: false, code: 'INVALID_REQUEST', reason: 'Unexpected Slack action.' };
  if (interaction.intentId !== approval.intentId) return { ok: false, code: 'INVALID_REQUEST', reason: 'Approval intent does not match.' };
  if (interaction.nonce !== approval.nonce) return { ok: false, code: 'UNAUTHORIZED', reason: 'Approval nonce does not match.' };
  if (!approval.reviewerUserIds.includes(interaction.userId)) return { ok: false, code: 'UNAUTHORIZED', reason: 'Reviewer is not allowlisted.' };
  if (approval.decision === 'approved') return { ok: true, decision: 'approved' };
  if (approval.decision !== 'pending') return { ok: false, code: 'INVALID_REQUEST', reason: `Approval is already ${approval.decision}.` };
  if (new Date(approval.expiresAt).getTime() <= input.now.getTime()) return { ok: false, code: 'APPROVAL_EXPIRED', reason: 'Approval has expired.' };
  return { ok: true, decision: 'approved' };
}

export function approvalStillValid(approval: ApprovalRecord, now: Date): boolean {
  return approval.decision === 'approved' && new Date(approval.expiresAt).getTime() > now.getTime();
}
