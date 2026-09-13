import type { ConnectionState, EnvironmentRegistry, ProviderMode } from '@releaseproof/contracts';
import { createGitHubAdapter } from './github.js';
import { createLinearAdapter } from './linear.js';
import { createSlackAdapter } from './slack.js';
import type { Transport } from './transport.js';

export async function probeConnections(input: {
  environment: EnvironmentRegistry;
  transport: Transport;
  tokens?: { github?: string; slack?: string; linear?: string };
  now?: Date;
}): Promise<ConnectionState[]> {
  const now = (input.now ?? new Date()).toISOString();
  const github = createGitHubAdapter({
    mode: input.environment.github.mode,
    baseUrl: input.environment.github.baseUrl,
    repositoryFullName: input.environment.repositoryFullName,
    token: input.tokens?.github,
    transport: input.transport
  });
  const slack = createSlackAdapter({
    mode: input.environment.slack.mode,
    baseUrl: input.environment.slack.baseUrl,
    token: input.tokens?.slack,
    transport: input.transport
  });
  const linear = createLinearAdapter({
    mode: input.environment.linear.mode,
    baseUrl: input.environment.linear.baseUrl,
    apiKey: input.tokens?.linear,
    transport: input.transport
  });

  return [
    await connectionFrom('github', input.environment.github.mode, () => github.capabilityCheck(), now),
    await connectionFrom('slack', input.environment.slack.mode, () => slack.capabilityCheck(), now),
    await connectionFrom('linear', input.environment.linear.mode, () => linear.capabilityCheck(), now)
  ];
}

async function connectionFrom(
  provider: ConnectionState['provider'],
  mode: ProviderMode,
  probe: () => Promise<{ kind: string; value?: unknown; reason?: string; code?: string; capability?: string }>,
  checkedAt: string
): Promise<ConnectionState> {
  const result = await probe();
  if (result.kind === 'observed') {
    const capabilities = result.value && typeof result.value === 'object' && 'capabilities' in result.value
      ? (result.value as { capabilities?: string[] }).capabilities ?? []
      : [];
    return { provider, mode, state: 'confirmed', checkedAt, capabilities, detail: 'Required read capabilities responded.' };
  }
  if (result.kind === 'unsupported') {
    return { provider, mode, state: 'unsupported', checkedAt, capabilities: [], detail: result.capability ?? 'Unsupported capability.' };
  }
  return { provider, mode, state: 'unavailable', checkedAt, capabilities: [], detail: result.reason ?? result.code ?? 'Provider probe failed.' };
}

export function unconfiguredConnections(mode: ProviderMode): ConnectionState[] {
  return [
    { provider: 'github', mode, state: 'unconfigured', checkedAt: null, capabilities: [], detail: 'Dedicated GitHub demo repository and token are not configured.' },
    { provider: 'slack', mode, state: 'unconfigured', checkedAt: null, capabilities: [], detail: 'Slack workspace, channel, reviewer, and app tokens are not configured.' },
    { provider: 'linear', mode, state: 'unconfigured', checkedAt: null, capabilities: [], detail: 'Linear team, released state, and API key are not configured.' }
  ];
}
