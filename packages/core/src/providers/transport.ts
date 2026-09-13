import type { ProviderOutcome } from '@releaseproof/contracts';

export type Transport = { fetch(input: string | URL, init?: RequestInit): Promise<Response> };

export function assertFixtureUrl(baseUrl: string): void {
  const url = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Fixture mode only permits loopback provider URLs.');
  }
}

export async function normalizedRead(transport: Transport, url: string): Promise<ProviderOutcome> {
  try {
    const response = await transport.fetch(url, { signal: AbortSignal.timeout(5_000) });
    const body = await response.text();
    if (!response.ok) return response.status === 501 ? { kind: 'unsupported', capability: 'fixture-endpoint' } : { kind: 'rejected', code: `HTTP_${response.status}` };
    const parsed: unknown = body ? JSON.parse(body) : null;
    if (parsed && typeof parsed === 'object' && 'errors' in parsed) return { kind: 'rejected', code: 'GRAPHQL_ERRORS' };
    return { kind: 'observed', observationId: crypto.randomUUID(), value: parsed };
  } catch (error) {
    return { kind: 'unknown', reason: error instanceof Error ? error.name : 'transport_failure' };
  }
}
