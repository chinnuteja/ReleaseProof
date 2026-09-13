import './load-local-env.js';
import { requireModelConfig, parseRuntimeConfig, smokeTestGeminiStructuredOutput, smokeTestStructuredOutput } from '@releaseproof/core';

async function main(): Promise<number> {
  const parsed = parseRuntimeConfig({
    DATABASE_PATH: process.env.DATABASE_PATH || 'var/releaseproof.sqlite',
    APP_ORIGIN: process.env.APP_ORIGIN || 'http://127.0.0.1:3000',
    OPERATOR_PASSWORD: process.env.OPERATOR_PASSWORD || 'local-operator-password',
    SESSION_SECRET: process.env.SESSION_SECRET || 'local-session-secret-which-is-long-enough',
    ...(process.env.OPENAI_API_KEY ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}),
    ...(process.env.OPENAI_MODEL ? { OPENAI_MODEL: process.env.OPENAI_MODEL } : {}),
    ...(process.env.GEMINI_API_KEY ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
    ...(process.env.GEMINI_MODEL ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {})
  });
  const model = parsed.ok ? requireModelConfig(parsed.value) : null;
  if (!model) {
    process.stderr.write('Model smoke test is blocked: GEMINI_API_KEY or OPENAI_API_KEY + OPENAI_MODEL are not configured.\n');
    return 2;
  }
  const result = model.provider === 'gemini'
    ? await smokeTestGeminiStructuredOutput(model.apiKey, model.model)
    : await smokeTestStructuredOutput(model.apiKey, model.model);
  if (!result.ok) {
    process.stderr.write(`Model smoke test failed: ${result.reason}\n`);
    return 1;
  }
  process.stdout.write(`Model smoke test returned schema-valid structured output for ${result.model}.\n`);
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
