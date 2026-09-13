import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnvironmentRegistry, ProviderMode } from '@releaseproof/contracts';
import { fingerprintEnvironment, parseEnvironmentRegistry } from '../domain/environment.js';

export function loadEnvironmentRegistry(options: {
  path?: string | undefined;
  mode?: ProviderMode | undefined;
  baseUrls?: { github?: string | undefined; slack?: string | undefined; linear?: string | undefined } | undefined;
} = {}): { environment: EnvironmentRegistry; fingerprint: string } {
  const configuredPath = options.path ?? process.env.RELEASEPROOF_ENVIRONMENT_PATH;
  const fallback = options.mode === 'real_test' ? 'config/demo-environment.example.json' : 'config/fixture-environment.json';
  const directPath = resolve(/* turbopackIgnore: true */ configuredPath ?? fallback);
  const workspacePath = resolve(/* turbopackIgnore: true */ process.cwd(), '../..', configuredPath ?? fallback);
  const registryPath = existsSync(directPath) ? directPath : workspacePath;
  const environment = parseEnvironmentRegistry(JSON.parse(readFileSync(registryPath, 'utf8')));
  const patched: EnvironmentRegistry = {
    ...environment,
    github: { ...environment.github, baseUrl: options.baseUrls?.github ?? environment.github.baseUrl, mode: options.mode ?? environment.github.mode },
    slack: { ...environment.slack, baseUrl: options.baseUrls?.slack ?? environment.slack.baseUrl, mode: options.mode ?? environment.slack.mode },
    linear: { ...environment.linear, baseUrl: options.baseUrls?.linear ?? environment.linear.baseUrl, mode: options.mode ?? environment.linear.mode }
  };
  return { environment: patched, fingerprint: fingerprintEnvironment(patched) };
}
