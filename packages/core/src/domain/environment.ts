import { createHash } from 'node:crypto';
import { EnvironmentRegistrySchema, type EnvironmentRegistry } from '@releaseproof/contracts';

export const POLICY_VERSION = '2026-09-p2';

export function fingerprintEnvironment(registry: EnvironmentRegistry): string {
  return createHash('sha256').update(canonicalJson(registry), 'utf8').digest('hex');
}

export function parseEnvironmentRegistry(value: unknown): EnvironmentRegistry {
  return EnvironmentRegistrySchema.parse(value);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortValue((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}
