import './load-local-env.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvironmentRegistry, openDatabase, probeConnections, requireModelConfig, parseRuntimeConfig, smokeTestGeminiStructuredOutput, smokeTestStructuredOutput } from '@releaseproof/core';

const require = createRequire(import.meta.url);

async function main(): Promise<number> {
  const mode = process.argv.includes('real_test') ? 'real_test' : 'fixture';
  const requiredNode = [24, 21, 0] as const;
  const actualNode = process.versions.node.split('.').map(Number);
  if (actualNode[0] !== requiredNode[0] || actualNode[1]! < requiredNode[1]) {
    process.stderr.write(`Node ${process.versions.node} is unsupported; require Node >= ${requiredNode.join('.')}.\n`);
    return 1;
  }
  process.stdout.write(`Runtime: Node ${process.versions.node}\n`);

  const tsxShim = resolve('node_modules/.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  if (!existsSync(tsxShim)) {
    process.stderr.write('Clean install is incomplete: node_modules/.bin shims are missing. Re-run npm ci with Node 24.21.0.\n');
    return 1;
  }

  try {
    require('better-sqlite3');
    process.stdout.write('better-sqlite3 native/prebuild binding loaded.\n');
  } catch (error) {
    process.stderr.write(`better-sqlite3 failed to load: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  if (mode === 'fixture') {
    const database = openDatabase(process.env.DATABASE_PATH ?? resolve('var/doctor-fixture.sqlite'));
    try {
      database.prepare('SELECT 1 AS healthy').get();
      process.stdout.write('Fixture mode: SQLite writable; provider URLs will be loopback-only.\n');
    } finally {
      database.close();
    }
    return 0;
  }

  const missing = ['GITHUB_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'LINEAR_API_KEY'].filter((name) => !process.env[name]);
  if (!process.env.GEMINI_API_KEY && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)) missing.push('GEMINI_API_KEY or OPENAI_API_KEY + OPENAI_MODEL');
  if (missing.length > 0) {
    process.stderr.write(`Real-test access is blocked: missing ${missing.join(', ')}.\n`);
    return 2;
  }

  const loaded = loadEnvironmentRegistry({ mode: 'real_test', path: process.env.RELEASEPROOF_ENVIRONMENT_PATH ?? 'config/demo-environment.example.json' });
  const connections = await probeConnections({
    environment: loaded.environment,
    transport: { fetch },
    tokens: {
      github: process.env.GITHUB_TOKEN,
      slack: process.env.SLACK_BOT_TOKEN,
      linear: process.env.LINEAR_API_KEY
    }
  });
  for (const connection of connections) {
    process.stdout.write(`${connection.provider}: ${connection.state} ${connection.detail}\n`);
  }
  let exitCode = connections.some((connection) => connection.state !== 'confirmed') ? 2 : 0;
  const parsed = parseRuntimeConfig(process.env);
  const model = parsed.ok ? requireModelConfig(parsed.value) : null;
  if (model) {
    const smoke = model.provider === 'gemini'
      ? await smokeTestGeminiStructuredOutput(model.apiKey, model.model)
      : await smokeTestStructuredOutput(model.apiKey, model.model);
    process.stdout.write(smoke.ok ? `model: confirmed structured-output smoke for ${smoke.model}\n` : `model: unavailable ${smoke.reason}\n`);
    if (!smoke.ok) exitCode = 2;
  }
  return exitCode;
}

void main().then((code) => {
  process.exitCode = code;
});
