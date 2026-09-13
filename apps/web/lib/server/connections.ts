import type { ConnectionState } from '@releaseproof/contracts';
import { loadEnvironmentRegistry, probeConnections, unconfiguredConnections } from '@releaseproof/core';

export async function connectionProjection(): Promise<ConnectionState[]> {
  const mode = process.env.RELEASEPROOF_MODE === 'real_test' ? 'real_test' : 'fixture';
  const hasReal = Boolean(process.env.GITHUB_TOKEN && process.env.SLACK_BOT_TOKEN && process.env.LINEAR_API_KEY);
  if (mode === 'real_test' && !hasReal) return unconfiguredConnections('real_test');
  try {
    const loaded = loadEnvironmentRegistry({ mode, path: process.env.RELEASEPROOF_ENVIRONMENT_PATH });
    const url = new URL(loaded.environment.github.baseUrl);
    if (url.port === '0') return unconfiguredConnections(mode);
    const tokens: { github?: string; slack?: string; linear?: string } = {};
    if (process.env.GITHUB_TOKEN) tokens.github = process.env.GITHUB_TOKEN;
    if (process.env.SLACK_BOT_TOKEN) tokens.slack = process.env.SLACK_BOT_TOKEN;
    if (process.env.LINEAR_API_KEY) tokens.linear = process.env.LINEAR_API_KEY;
    return await probeConnections({
      environment: loaded.environment,
      transport: { fetch },
      tokens
    });
  } catch {
    return unconfiguredConnections(mode);
  }
}
