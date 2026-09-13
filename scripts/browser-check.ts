// Browser automation is intentionally not faked. This check confirms the
// browser-facing workspace compiles as part of the standard build; interactive
// acceptance requires a configured local runtime and is covered at final test.
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace', '@releaseproof/web'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
