import { z } from 'zod';

const RuntimeConfigSchema = z.object({
  DATABASE_PATH: z.string().trim().min(1),
  APP_ORIGIN: z.url(),
  OPERATOR_PASSWORD: z.string().min(12),
  SESSION_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  SLACK_APP_TOKEN: z.string().min(1).optional(),
  LINEAR_API_KEY: z.string().min(1).optional()
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export type RuntimeConfigResult =
  | { ok: true; value: RuntimeConfig }
  | { ok: false; missing: string[]; invalid: string[] };

export function parseRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfigResult {
  const candidate = Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined));
  const parsed = RuntimeConfigSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, value: parsed.data };

  const missing = new Set<string>();
  const invalid = new Set<string>();
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'unknown');
    if (issue.code === 'invalid_type' && issue.input === undefined) missing.add(key);
    else invalid.add(key);
  }
  return { ok: false, missing: [...missing].sort(), invalid: [...invalid].sort() };
}

export function requireModelConfig(config: RuntimeConfig): { provider: 'openai'; apiKey: string; model: string } | { provider: 'gemini'; apiKey: string; model?: string } | null {
  if (config.GEMINI_API_KEY) return { provider: 'gemini', apiKey: config.GEMINI_API_KEY, ...(config.GEMINI_MODEL ? { model: config.GEMINI_MODEL } : {}) };
  return config.OPENAI_API_KEY && config.OPENAI_MODEL
    ? { provider: 'openai', apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL }
    : null;
}
