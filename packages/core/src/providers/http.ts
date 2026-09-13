import type { Outcome } from './ports.js';
import type { Transport } from './transport.js';

export async function requestJson(transport: Transport, url: string, init: RequestInit = {}): Promise<Outcome<unknown>> {
  try {
    const response = await transport.fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(8_000) });
    const body = await response.text();
    const parsed: unknown = body ? JSON.parse(body) : null;
    if (!response.ok) {
      if (response.status === 404) return { kind: 'observed', observationId: crypto.randomUUID(), value: null };
      if (response.status === 501) return { kind: 'unsupported', capability: url };
      return { kind: 'rejected', code: `HTTP_${response.status}` };
    }
    if (parsed && typeof parsed === 'object' && 'errors' in parsed) return { kind: 'rejected', code: 'GRAPHQL_ERRORS' };
    if (parsed && typeof parsed === 'object' && 'ok' in parsed && (parsed as { ok?: unknown }).ok === false) {
      return { kind: 'rejected', code: String((parsed as { error?: unknown }).error ?? 'SLACK_ERROR') };
    }
    return { kind: 'observed', observationId: crypto.randomUUID(), value: parsed };
  } catch (error) {
    return { kind: 'unknown', reason: error instanceof Error ? error.name : 'transport_failure' };
  }
}

export function asObserved<T>(outcome: Outcome<unknown>, map: (value: unknown) => T): Outcome<T> {
  if (outcome.kind !== 'observed') return outcome;
  return { kind: 'observed', observationId: outcome.observationId, value: map(outcome.value) };
}
