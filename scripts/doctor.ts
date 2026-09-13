import { resolve } from 'node:path';
import { openDatabase } from '@releaseproof/core';

const mode = process.argv.includes('real_test') ? 'real_test' : 'fixture';
const requiredNode = [24, 21, 0] as const;
const actualNode = process.versions.node.split('.').map(Number);
if (actualNode[0] !== requiredNode[0] || actualNode[1]! < requiredNode[1]) {
  process.stderr.write(`Node ${process.versions.node} is unsupported; require Node >= ${requiredNode.join('.')}.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Runtime: Node ${process.versions.node}\n`);
}

if (mode === 'fixture') {
  const database = openDatabase(process.env.DATABASE_PATH ?? resolve('var/doctor-fixture.sqlite'));
  try {
    database.prepare('SELECT 1 AS healthy').get();
    process.stdout.write('Fixture mode: SQLite writable; provider URLs will be loopback-only.\n');
  } finally {
    database.close();
  }
} else {
  const missing = ['GITHUB_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'LINEAR_API_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL'].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    process.stderr.write(`Real-test access is blocked: missing ${missing.join(', ')}.\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write('Real-test credentials are present. Capability probes are not implemented until provider configuration is supplied.\n');
    process.exitCode = 2;
  }
}
