import type { ProviderMode } from '@releaseproof/contracts';
import type { ObservedCheck } from '../domain/checks.js';
import type { Outcome } from './ports.js';
import type { GitHubPort, GitHubPullRequest, GitHubRelease } from './ports.js';
import { requestJson, asObserved } from './http.js';
import type { Transport } from './transport.js';
import { assertFixtureUrl } from './transport.js';

export function createGitHubAdapter(options: {
  mode: ProviderMode;
  baseUrl: string;
  token?: string | undefined;
  repositoryFullName: string;
  transport: Transport;
}): GitHubPort {
  if (options.mode === 'fixture') assertFixtureUrl(options.baseUrl);
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const repoPath = `${trimSlash(options.baseUrl)}/repos/${options.repositoryFullName}`;

  return {
    mode: options.mode,
    healthCheck: () => requestJson(options.transport, `${trimSlash(options.baseUrl)}/rate_limit`, { headers }),
    capabilityCheck: async () => {
      const repo = await requestJson(options.transport, repoPath, { headers });
      if (repo.kind !== 'observed' || !repo.value) return repo.kind === 'observed' ? { kind: 'rejected', code: 'REPOSITORY_UNAVAILABLE' } : repo;
      return { kind: 'observed', observationId: repo.observationId, value: { capabilities: ['pulls', 'checks', 'releases', 'git-refs'] } };
    },
    readRepository: async () => asObserved(await requestJson(options.transport, repoPath, { headers }), (value) => {
      const record = asRecord(value);
      return { id: String(record.id ?? ''), fullName: String(record.full_name ?? options.repositoryFullName) };
    }),
    readPullRequest: async (number) => asObserved(await requestJson(options.transport, `${repoPath}/pulls/${number}`, { headers }), (value) => {
      const record = asRecord(value);
      const head = asRecord(record.head);
      return {
        number,
        title: String(record.title ?? ''),
        body: typeof record.body === 'string' ? record.body : null,
        headSha: String(head.sha ?? ''),
        htmlUrl: String(record.html_url ?? ''),
        merged: Boolean(record.merged),
        repositoryFullName: options.repositoryFullName,
        repositoryId: String(asRecord(record.base).repo ? asRecord(asRecord(record.base).repo).id ?? '' : '')
      } satisfies GitHubPullRequest;
    }),
    readChecks: async (sha) => asObserved(await requestJson(options.transport, `${repoPath}/commits/${sha}/check-runs`, { headers }), (value) => {
      const record = asRecord(value);
      const runs = Array.isArray(record.check_runs) ? record.check_runs : [];
      return runs.map((item) => {
        const check = asRecord(item);
        const app = asRecord(check.app);
        return {
          name: String(check.name ?? ''),
          appId: String(app.id ?? app.slug ?? ''),
          headSha: String(check.head_sha ?? sha),
          status: String(check.status ?? ''),
          conclusion: typeof check.conclusion === 'string' ? check.conclusion : null
        } satisfies ObservedCheck;
      });
    }),
    readReleaseByTag: async (tagName) => {
      const outcome = await requestJson(options.transport, `${repoPath}/releases/tags/${encodeURIComponent(tagName)}`, { headers });
      if (outcome.kind !== 'observed') return outcome;
      if (outcome.value === null) return { kind: 'observed', observationId: outcome.observationId, value: null };
      return { kind: 'observed', observationId: outcome.observationId, value: toRelease(outcome.value) };
    },
    resolveTagCommit: async (tagName) => resolveTag(options.transport, repoPath, headers, tagName, 0, new Set()),
    createPrerelease: async (input) => asObserved(await requestJson(options.transport, `${repoPath}/releases`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        tag_name: input.tagName,
        target_commitish: input.commitSha,
        name: input.name,
        body: input.body,
        prerelease: true
      })
    }), toRelease)
  };
}

async function resolveTag(
  transport: Transport,
  repoPath: string,
  headers: Record<string, string>,
  tagName: string,
  depth: number,
  seen: Set<string>
): Promise<Outcome<string | null>> {
  if (depth > 5) return { kind: 'rejected', code: 'TAG_CYCLE' };
  const ref = await requestJson(transport, `${repoPath}/git/ref/tags/${encodeURIComponent(tagName)}`, { headers });
  if (ref.kind !== 'observed') return ref;
  if (ref.value === null) return { kind: 'observed', observationId: ref.observationId, value: null };
  const object = asRecord(asRecord(ref.value).object);
  const sha = String(object.sha ?? '');
  const type = String(object.type ?? 'commit');
  if (!sha) return { kind: 'observed', observationId: ref.observationId, value: null };
  return resolveTagObject(transport, repoPath, headers, sha, type, depth, seen, ref.observationId);
}

async function resolveTagObject(
  transport: Transport,
  repoPath: string,
  headers: Record<string, string>,
  sha: string,
  type: string,
  depth: number,
  seen: Set<string>,
  observationId: string
): Promise<Outcome<string | null>> {
  if (!sha) return { kind: 'observed', observationId, value: null };
  if (depth > 5 || seen.has(sha)) return { kind: 'rejected', code: 'TAG_CYCLE' };
  seen.add(sha);
  if (type !== 'tag') return { kind: 'observed', observationId, value: sha };
  const annotated = await requestJson(transport, `${repoPath}/git/tags/${encodeURIComponent(sha)}`, { headers });
  if (annotated.kind !== 'observed') return annotated;
  if (annotated.value === null) return { kind: 'rejected', code: 'ANNOTATED_TAG_MISSING' };
  const target = asRecord(asRecord(annotated.value).object);
  const nextSha = String(target.sha ?? '');
  const nextType = String(target.type ?? 'commit');
  return resolveTagObject(transport, repoPath, headers, nextSha, nextType, depth + 1, seen, annotated.observationId);
}

function toRelease(value: unknown): GitHubRelease {
  const record = asRecord(value);
  return {
    id: String(record.id ?? ''),
    tagName: String(record.tag_name ?? ''),
    targetCommitish: String(record.target_commitish ?? ''),
    name: String(record.name ?? ''),
    body: String(record.body ?? ''),
    prerelease: Boolean(record.prerelease),
    htmlUrl: String(record.html_url ?? '')
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}
