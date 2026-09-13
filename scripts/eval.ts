import { spawnSync } from 'node:child_process';

// The evaluation baseline is deliberately deterministic and offline: the same
// stateful provider fixture proves authority, response-loss recovery, and
// observed completion without claiming that a live provider was tested.
const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/verify.ts', '--phase', 'P3', '--mode', 'fixture'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
