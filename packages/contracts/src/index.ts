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
  slack: z.object({ mode: ProviderModeSchema, baseUrl: z.url(), teamId: z.string().min(1), channelId: z.string().min(1), reviewerUserIds: z.array(z.string().min(1)).min(1) }),
  linear: z.object({ mode: ProviderModeSchema, baseUrl: z.url(), teamId: z.string().min(1), releasedStateId: z.string().min(1) }),
  requiredChecks: z.array(z.object({ name: z.string().min(1), appId: z.string().min(1) })),
  releaseTagPrefix: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  policyVersion: z.string().min(1)
});
export type EnvironmentRegistry = z.infer<typeof EnvironmentRegistrySchema>;

export const ErrorResponseSchema = z.object({
  code: z.enum(['INVALID_REQUEST', 'VERSION_CONFLICT', 'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'TARGET_CONFLICT', 'PROVIDER_UNKNOWN', 'CAPABILITY_UNSUPPORTED', 'BUDGET_EXCEEDED', 'CONFIGURATION_INVALID', 'UNAUTHORIZED', 'CSRF_INVALID']),
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
