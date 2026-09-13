import type { Manifest } from '@releaseproof/contracts';

export type ObservedCheck = {
  name: string;
  appId: string;
  headSha: string;
  status: string;
  conclusion: string | null;
};

export function evaluateRequiredChecks(manifest: Manifest, observed: readonly ObservedCheck[]): { ok: true } | { ok: false; reason: string } {
  for (const required of manifest.requiredChecks) {
    if (required.headSha !== manifest.commitSha) return { ok: false, reason: `Required check ${required.name} does not cover the approved SHA.` };
    const matches = observed.filter((check) => check.name === required.name && check.appId === required.appId && check.headSha === required.headSha);
    if (matches.length === 0) return { ok: false, reason: `Required check ${required.name} from ${required.appId} was not observed on ${required.headSha}.` };
    if (!matches.some((match) => match.status === 'completed' && match.conclusion === 'success')) {
      const latest = matches.at(-1)!;
      return { ok: false, reason: `Required check ${required.name} is ${latest.conclusion ?? latest.status}, not a successful completion.` };
    }
  }
  return { ok: true };
}
