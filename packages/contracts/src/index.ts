import { z } from 'zod';

export const ProviderModeSchema = z.enum(['fixture', 'arga', 'real_test']);
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

export const ProviderNameSchema = z.enum(['github', 'slack', 'linear']);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

export const RunPhaseSchema = z.enum([
  'requested', 'gathering', 'planned', 'awaiting_approval', 'publishing', 'updating_apps', 'verifying', 'complete'
]);
export type RunPhase = z.infer<typeof RunPhaseSchema>;

export const RunStatusSchema = z.enum([
  'active', 'waiting_for_approval', 'waiting_for_provider', 'reconciling', 'partially_complete', 'needs_attention', 'cancelled', 'failed', 'completed'
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const CommandStatusSchema = z.enum(['queued', 'applied', 'rejected']);
export type CommandStatus = z.infer<typeof CommandStatusSchema>;

export const CommandKindSchema = z.enum([
  'prepare_run', 'plan_run', 'request_approval', 'apply_approval', 'execute_github', 'execute_linear', 'execute_slack', 'verify_run', 'replan_run', 'cancel_run', 'retry_run'
]);
export type CommandKind = z.infer<typeof CommandKindSchema>;

export const ProviderOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('observed'), observationId: z.string().min(1), value: z.unknown() }),
  z.object({ kind: z.literal('not_sent'), reason: z.string().min(1) }),
  z.object({ kind: z.literal('rejected'), code: z.string().min(1), retryAfterMs: z.number().int().nonnegative().optional() }),
  z.object({ kind: z.literal('unknown'), reason: z.string().min(1) }),
  z.object({ kind: z.literal('unsupported'), capability: z.string().min(1) })
]);
export type ProviderOutcome = z.infer<typeof ProviderOutcomeSchema>;

export const RunRequestSchema = z.object({
  requestKey: z.string().uuid(),
  issueIdentifier: z.string().trim().min(1).max(128),
  releaseIntent: z.string().trim().min(1).max(2_000)
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const EnvironmentRegistrySchema = z.object({
  environmentId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  repositoryId: z.string().min(1),
  repositoryFullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  github: z.object({ mode: ProviderModeSchema, baseUrl: z.url() }),
  slack: z.object({
    mode: ProviderModeSchema,
    baseUrl: z.url(),
    appId: z.string().min(1),
    teamId: z.string().min(1),
    channelId: z.string().min(1),
    reviewerUserIds: z.array(z.string().min(1)).min(1)
  }),
  linear: z.object({ mode: ProviderModeSchema, baseUrl: z.url(), teamId: z.string().min(1), releasedStateId: z.string().min(1) }),
  requiredChecks: z.array(z.object({ name: z.string().min(1), appId: z.string().min(1) })),
  releaseTagPrefix: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  policyVersion: z.string().min(1)
});
export type EnvironmentRegistry = z.infer<typeof EnvironmentRegistrySchema>;

export const ErrorResponseSchema = z.object({
  code: z.enum([
    'INVALID_REQUEST', 'VERSION_CONFLICT', 'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'TARGET_CONFLICT',
    'PROVIDER_UNKNOWN', 'CAPABILITY_UNSUPPORTED', 'BUDGET_EXCEEDED', 'CONFIGURATION_INVALID', 'UNAUTHORIZED',
    'CSRF_INVALID', 'PLANNER_INVALID', 'CHECK_EVIDENCE_INVALID'
  ]),
  message: z.string(),
  retryable: z.boolean(),
  correlationId: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const RuleResultSchema = z.enum(['pass', 'fail', 'inconclusive', 'not_applicable']);
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const ConnectionStateSchema = z.object({
  provider: ProviderNameSchema,
  mode: ProviderModeSchema,
  state: z.enum(['unconfigured', 'confirmed', 'unavailable', 'unsupported']),
  checkedAt: z.string().datetime().nullable(),
  capabilities: z.array(z.string()),
  detail: z.string().max(500)
});
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const CommitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);

export const ManifestIssueSchema = z.object({
  issueId: z.string().min(1),
  releasedStateId: z.string().min(1)
});

export const ManifestCheckSchema = z.object({
  name: z.string().min(1),
  appId: z.string().min(1),
  headSha: CommitShaSchema
});

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  environmentId: z.string().min(1),
  environmentFingerprint: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryFullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  commitSha: CommitShaSchema,
  tagName: z.string().min(1),
  releaseKind: z.literal('prerelease'),
  releaseTitle: z.string().min(1).max(256),
  releaseBodyHash: z.string().regex(/^[0-9a-f]{64}$/),
  linearTeamId: z.string().min(1),
  issues: z.array(ManifestIssueSchema).min(1),
  slackTeamId: z.string().min(1),
  slackChannelId: z.string().min(1),
  requiredChecks: z.array(ManifestCheckSchema).min(1),
  policyVersion: z.string().min(1)
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const PlannerProposalSchema = z.object({
  issueId: z.string().min(1),
  issueIdentifier: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  repositoryFullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  commitSha: CommitShaSchema,
  tagName: z.string().min(1),
  releaseTitle: z.string().min(1).max(256),
  releaseBody: z.string().min(1).max(8_000),
  requiredChecks: z.array(ManifestCheckSchema).min(1),
  linearTeamId: z.string().min(1),
  issues: z.array(ManifestIssueSchema).min(1),
  slackTeamId: z.string().min(1),
  slackChannelId: z.string().min(1)
});
export type PlannerProposal = z.infer<typeof PlannerProposalSchema>;

export const SlackInteractionSchema = z.object({
  transportDedupeKey: z.string().min(1),
  appId: z.string().min(1),
  teamId: z.string().min(1),
  channelId: z.string().min(1),
  messageTs: z.string().min(1),
  userId: z.string().min(1),
  actionId: z.string().min(1),
  intentId: z.string().min(1),
  nonce: z.string().min(1)
});
export type SlackInteraction = z.infer<typeof SlackInteractionSchema>;

export const ReceiptAppOutcomeSchema = z.object({
  provider: ProviderNameSchema,
  mode: ProviderModeSchema,
  status: z.enum(['pending', 'observed', 'missing', 'conflict']),
  objectId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  summary: z.string()
});
export type ReceiptAppOutcome = z.infer<typeof ReceiptAppOutcomeSchema>;

export const ReceiptSchema = z.object({
  runId: z.string().min(1),
  requestKey: z.string().min(1),
  issueIdentifier: z.string().nullable(),
  approvedSha: z.string().nullable(),
  observedSha: z.string().nullable(),
  reviewerUserId: z.string().nullable(),
  manifestHash: z.string().nullable(),
  completed: z.boolean(),
  pending: z.array(z.string()),
  outcomes: z.array(ReceiptAppOutcomeSchema)
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const RunProjectionSchema = z.object({
  runId: z.string(),
  environmentId: z.string(),
  requestKey: z.string(),
  issueIdentifier: z.string().nullable(),
  releaseIntent: z.string().nullable(),
  phase: RunPhaseSchema,
  status: RunStatusSchema,
  version: z.number().int().positive(),
  manifestHash: z.string().nullable(),
  approvedSha: z.string().nullable(),
  approval: z.object({
    decision: z.enum(['pending', 'approved', 'rejected', 'expired', 'invalid']),
    reviewerUserId: z.string().nullable(),
    expiresAt: z.string().nullable(),
    messageTs: z.string().nullable()
  }),
  nextActions: z.array(z.string()),
  plannerError: z.string().nullable(),
  receipt: ReceiptSchema.nullable()
});
export type RunProjection = z.infer<typeof RunProjectionSchema>;
