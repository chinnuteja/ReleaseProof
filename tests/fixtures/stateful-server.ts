import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export type FixtureState = {
  repo: { id: string; fullName: string };
  pullRequests: Record<number, {
    number: number;
    title: string;
    body: string;
    headSha: string;
    htmlUrl: string;
    merged: boolean;
    repositoryId: string;
  }>;
  branches: Record<string, string>;
  checks: Record<string, { name: string; appId: string; headSha: string; status: string; conclusion: string | null }[]>;
  tags: Record<string, { sha: string; annotated?: boolean }>;
  releases: Record<string, { id: string; tagName: string; targetCommitish: string; name: string; body: string; prerelease: boolean; htmlUrl: string }>;
  issues: Record<string, {
    id: string;
    identifier: string;
    title: string;
    description: string;
    url: string;
    teamId: string;
    stateId: string;
    stateName: string;
    comments: { id: string; body: string }[];
  }>;
  slack: {
    teamId: string;
    channelId: string;
    messages: Record<string, { ts: string; channelId: string; text: string }>;
  };
  publishAttempts: number;
};

export type StatefulFixture = {
  baseUrl: string;
  githubBaseUrl: string;
  slackBaseUrl: string;
  linearBaseUrl: string;
  state: FixtureState;
  close: () => Promise<void>;
};

const defaultShaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const defaultShaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export function defaultFixtureState(overrides: Partial<FixtureState> = {}): FixtureState {
  const issue = {
    id: 'ISSUE-1',
    identifier: 'REL-1',
    title: 'Ship the approved prerelease',
    description: 'See https://github.com/acme/releaseproof-demo/pull/7 for the linked revision.',
    url: 'https://linear.app/fixture/issue/REL-1',
    teamId: 'TEAM-FIXTURE',
    stateId: 'STATE-READY',
    stateName: 'Ready',
    comments: [] as { id: string; body: string }[]
  };
  return {
    repo: { id: '42', fullName: 'acme/releaseproof-demo' },
    pullRequests: {
      7: {
        number: 7,
        title: 'Release candidate',
        body: 'Linked from REL-1',
        headSha: defaultShaA,
        htmlUrl: 'https://github.com/acme/releaseproof-demo/pull/7',
        merged: true,
        repositoryId: '42'
      }
    },
    branches: { main: defaultShaA },
    checks: {
      [defaultShaA]: [{ name: 'ci', appId: 'github-actions', headSha: defaultShaA, status: 'completed', conclusion: 'success' }]
    },
    tags: {},
    releases: {},
    issues: { 'REL-1': issue, 'ISSUE-1': issue },
    slack: { teamId: 'T-FIXTURE', channelId: 'C-FIXTURE', messages: {} },
    publishAttempts: 0,
    ...overrides
  };
}

export const SHA_A = defaultShaA;
export const SHA_B = defaultShaB;

export async function startStatefulFixture(state: FixtureState = defaultFixtureState()): Promise<StatefulFixture> {
  const server = createServer((request, response) => {
    void handle(request, response, state);
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind a TCP port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    githubBaseUrl: `${baseUrl}/github`,
    slackBaseUrl: `${baseUrl}/slack`,
    linearBaseUrl: `${baseUrl}/linear/graphql`,
    state,
    close: () => new Promise<void>((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise()))
  };
}

async function handle(request: IncomingMessage, response: ServerResponse, state: FixtureState): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://fixture.local');
  const body = await readBody(request);
  response.setHeader('content-type', 'application/json');
  try {
    if (url.pathname === '/github/rate_limit') return json(response, { ok: true });
    if (url.pathname === `/github/repos/${state.repo.fullName}`) return json(response, { id: state.repo.id, full_name: state.repo.fullName });
    const pull = url.pathname.match(/\/github\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/);
    if (pull) {
      const item = state.pullRequests[Number(pull[1])];
      if (!item) return json(response, { message: 'not found' }, 404);
      return json(response, {
        number: item.number,
        title: item.title,
        body: item.body,
        merged: item.merged,
        html_url: item.htmlUrl,
        head: { sha: item.headSha },
        base: { repo: { id: item.repositoryId } }
      });
    }
    const checks = url.pathname.match(/\/github\/repos\/[^/]+\/[^/]+\/commits\/([0-9a-f]{40})\/check-runs$/);
    if (checks) {
      return json(response, {
        check_runs: (state.checks[checks[1] ?? ''] ?? []).map((check) => ({
          name: check.name,
          head_sha: check.headSha,
          status: check.status,
          conclusion: check.conclusion,
          app: { slug: check.appId, id: check.appId }
        }))
      });
    }
    const releaseTag = url.pathname.match(/\/github\/repos\/[^/]+\/[^/]+\/releases\/tags\/([^/]+)$/);
    if (releaseTag) {
      const release = state.releases[decodeURIComponent(releaseTag[1] ?? '')];
      return release ? json(response, releaseJson(release)) : json(response, { message: 'not found' }, 404);
    }
    if (url.pathname.endsWith('/releases') && request.method === 'POST') {
      state.publishAttempts += 1;
      const payload = JSON.parse(body || '{}') as { tag_name?: string; target_commitish?: string; name?: string; body?: string; prerelease?: boolean };
      const existingTag = state.tags[payload.tag_name ?? ''];
      if (existingTag && existingTag.sha !== payload.target_commitish) return json(response, { message: 'tag conflict' }, 422);
      const release = {
        id: `REL-${Object.keys(state.releases).length + 1}`,
        tagName: payload.tag_name ?? '',
        targetCommitish: payload.target_commitish ?? '',
        name: payload.name ?? '',
        body: payload.body ?? '',
        prerelease: Boolean(payload.prerelease),
        htmlUrl: `https://github.com/${state.repo.fullName}/releases/tag/${payload.tag_name}`
      };
      state.releases[release.tagName] = release;
      state.tags[release.tagName] = { sha: release.targetCommitish };
      return json(response, releaseJson(release), 201);
    }
    const ref = url.pathname.match(/\/github\/repos\/[^/]+\/[^/]+\/git\/ref\/tags\/([^/]+)$/);
    if (ref) {
      const tag = state.tags[decodeURIComponent(ref[1] ?? '')];
      if (!tag) return json(response, { message: 'not found' }, 404);
      return json(response, { object: { sha: tag.annotated ? `tagobj-${tag.sha}` : tag.sha, type: tag.annotated ? 'tag' : 'commit' } });
    }
    const annotated = url.pathname.match(/\/github\/repos\/[^/]+\/[^/]+\/git\/tags\/([^/]+)$/);
    if (annotated) {
      const sha = String(annotated[1] ?? '').replace(/^tagobj-/, '');
      return json(response, { object: { sha, type: 'commit' } });
    }
    if (url.pathname === '/linear/graphql') return handleLinear(response, body, state);
    if (url.pathname === '/slack/auth.test') return json(response, { ok: true, team_id: state.slack.teamId });
    if (url.pathname === '/slack/chat.postMessage') {
      const payload = JSON.parse(body || '{}') as { channel?: string; text?: string };
      const ts = `${Date.now()}.${Object.keys(state.slack.messages).length + 1}`;
      const message = { ts, channelId: payload.channel ?? state.slack.channelId, text: payload.text ?? '' };
      state.slack.messages[ts] = message;
      return json(response, { ok: true, channel: message.channelId, ts, message: { ts, text: message.text } });
    }
    if (url.pathname === '/slack/chat.update') {
      const payload = JSON.parse(body || '{}') as { channel?: string; ts?: string; text?: string };
      const message = state.slack.messages[payload.ts ?? ''];
      if (!message) return json(response, { ok: false, error: 'message_not_found' });
      message.text = payload.text ?? message.text;
      return json(response, { ok: true, channel: message.channelId, ts: message.ts, message: { ts: message.ts, text: message.text } });
    }
    if (url.pathname === '/slack/conversations.history') {
      const payload = JSON.parse(body || '{}') as { latest?: string };
      const message = state.slack.messages[payload.latest ?? ''];
      const messages = message
        ? [{ ts: message.ts, text: message.text }]
        : Object.values(state.slack.messages).map((item) => ({ ts: item.ts, text: item.text }));
      return json(response, { ok: true, messages });
    }
    json(response, { code: 'NOT_FOUND' }, 404);
  } catch (error) {
    json(response, { error: error instanceof Error ? error.message : 'fixture failure' }, 500);
  }
}

function handleLinear(response: ServerResponse, body: string, state: FixtureState): void {
  const payload = JSON.parse(body || '{}') as { query?: string; variables?: Record<string, string> };
  const query = payload.query ?? '';
  if (query.includes('viewer')) return json(response, { data: { viewer: { id: 'USER-1' } } });
  if (query.includes('commentCreate')) {
    const issue = findIssue(state, payload.variables?.issueId ?? '');
    if (!issue) return json(response, { data: null, errors: [{ message: 'issue missing' }] });
    const comment = { id: `C${issue.comments.length + 1}`, body: payload.variables?.body ?? '' };
    issue.comments.push(comment);
    return json(response, { data: { commentCreate: { comment } } });
  }
  if (query.includes('issueUpdate')) {
    const issue = findIssue(state, payload.variables?.id ?? '');
    if (!issue) return json(response, { data: null, errors: [{ message: 'issue missing' }] });
    issue.stateId = payload.variables?.stateId ?? issue.stateId;
    issue.stateName = 'Released';
    return json(response, { data: { issueUpdate: { issue: linearIssue(issue) } } });
  }
  const issue = findIssue(state, payload.variables?.id ?? '');
  if (!issue) return json(response, { data: null, errors: [{ message: 'issue missing' }] });
  return json(response, { data: { issue: linearIssue(issue) } });
}

function findIssue(state: FixtureState, key: string) {
  return state.issues[key];
}

function linearIssue(issue: FixtureState['issues'][string]) {
  return {
    ...issue,
    state: { id: issue.stateId, name: issue.stateName },
    team: { id: issue.teamId },
    comments: { nodes: issue.comments }
  };
}

function releaseJson(release: FixtureState['releases'][string]) {
  return {
    id: release.id,
    tag_name: release.tagName,
    target_commitish: release.targetCommitish,
    name: release.name,
    body: release.body,
    prerelease: release.prerelease,
    html_url: release.htmlUrl
  };
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.statusCode = status;
  response.end(JSON.stringify(value));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectPromise);
  });
}
