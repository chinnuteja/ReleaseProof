import { spawnSync } from 'node:child_process';

const phaseIndex = process.argv.indexOf('--phase');
const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : undefined;
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined;
if (phase !== 'P1') {
  process.stderr.write(`Verification for ${phase ?? 'an unspecified phase'} is not implemented; refusing a false pass.\n`);
  process.exitCode = 1;
} else if (mode !== 'fixture') {
  process.stderr.write('P1 real-test verification is blocked pending configured provider credentials and explicit capability probes.\n');
  process.exitCode = 2;
} else {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
