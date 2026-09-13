import type { ConnectionState } from '@releaseproof/contracts';

export function connectionProjection(): ConnectionState[] {
  return [
    { provider: 'github', mode: 'fixture', state: 'unconfigured', checkedAt: null, capabilities: [], detail: 'Awaiting a dedicated test repository and scoped token.' },
    { provider: 'slack', mode: 'fixture', state: 'unconfigured', checkedAt: null, capabilities: [], detail: 'Awaiting test workspace, channel, reviewer, and Socket Mode app.' },
    { provider: 'linear', mode: 'fixture', state: 'unconfigured', checkedAt: null, capabilities: [], detail: 'Awaiting a test team, issue state, and comment capability probe.' }
  ];
}
