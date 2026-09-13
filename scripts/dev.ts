import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const runtime = process.execPath;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = { ...process.env, DATABASE_PATH: process.env.DATABASE_PATH ?? resolve('var/releaseproof.sqlite') };
const worker = spawn(runtime, ['--import', 'tsx', 'apps/worker/src/main.ts'], { stdio: 'inherit', env: environment });
const web = spawn(npm, ['run', 'dev', '--workspace', '@releaseproof/web'], { stdio: 'inherit', env: environment, shell: process.platform === 'win32' });
const stop = () => { worker.kill(); web.kill(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
