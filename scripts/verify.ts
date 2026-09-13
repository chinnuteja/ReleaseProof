import { spawnSync } from 'node:child_process';

const phaseIndex = process.argv.indexOf('--phase');
const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : undefined;
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined;
const allowWrites = process.argv.includes('--allow-test-writes');

if (phase !== 'P1' && phase !== 'P2' && phase !== 'P3') {
  process.stderr.write(`Verification for ${phase ?? 'an unspecified phase'} is not implemented; refusing a false pass.\n`);
  process.exitCode = 1;
} else if (mode !== 'fixture') {
  if (phase === 'P2' && !allowWrites) {
    process.stderr.write('P2 real-test verification requires --allow-test-writes and configured dedicated demo resources.\n');
    process.exitCode = 2;
  } else {
    process.stderr.write(`${phase} real-test verification is blocked pending configured provider credentials, application model, and genuine Slack approval.\n`);
    process.exitCode = 2;
  }
} else {
  const include = phase === 'P1'
    ? ['tests/domain/foundation.test.ts']
    : ['tests/domain/authority.test.ts', 'tests/integration/p2-scenarios.test.ts'];
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts', ...include], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
