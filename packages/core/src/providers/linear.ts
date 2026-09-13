import type { ProviderMode } from '@releaseproof/contracts';
import type { Outcome } from './ports.js';
import type { LinearIssue, LinearPort } from './ports.js';
import { requestJson } from './http.js';
import type { Transport } from './transport.js';
import { assertFixtureUrl } from './transport.js';

const ISSUE_SELECTION = 'id identifier title description url state { id name } team { id } comments { nodes { id body } }';

export function createLinearAdapter(options: {
  mode: ProviderMode;
  baseUrl: string;
  apiKey?: string | undefined;
  transport: Transport;
}): LinearPort {
  if (options.mode === 'fixture') assertFixtureUrl(options.baseUrl);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.apiKey) headers.authorization = options.apiKey;

  const graphql = async (query: string, variables: Record<string, unknown> = {}): Promise<Outcome<unknown>> => {
    return requestJson(options.transport, options.baseUrl, { headers, method: 'POST', body: JSON.stringify({ query, variables }) });
  };

  return {
    mode: options.mode,
    healthCheck: () => graphql('{ viewer { id } }'),
    capabilityCheck: async () => {
      const outcome = await graphql('{ viewer { id } }');
      if (outcome.kind !== 'observed') return outcome;
      return { kind: 'observed', observationId: outcome.observationId, value: { annotationMethod: 'comment', capabilities: ['issue.read', 'issueUpdate', 'commentCreate'] } };
    },
    readIssue: async (identifier) => mapIssue(await graphql(`query($id: String!) { issue(id: $id) { ${ISSUE_SELECTION} } }`, { id: identifier })),
    updateIssueState: async (issueId, stateId) => mapIssue(await graphql(`mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { issue { ${ISSUE_SELECTION} } } }`, { id: issueId, stateId })),
    createReceiptComment: async (issueId, body) => {
      const outcome = await graphql('mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { comment { id body } } }', { issueId, body });
      if (outcome.kind !== 'observed') return outcome;
      const comment = asRecord(asRecord(asRecord(outcome.value).data).commentCreate).comment;
      const record = asRecord(comment);
      const id = requiredString(record.id);
      const commentBody = requiredString(record.body);
      if (!id || !commentBody) return { kind: 'rejected', code: 'LINEAR_MALFORMED_COMMENT' };
      return { kind: 'observed', observationId: outcome.observationId, value: { id, body: commentBody } };
    }
  };
}

function mapIssue(outcome: Outcome<unknown>): Outcome<LinearIssue> {
  if (outcome.kind !== 'observed') return outcome;
  const data = asRecord(asRecord(outcome.value).data);
  const raw = data.issue ?? asRecord(data.issueUpdate).issue;
  const record = asRecord(raw);
  const state = asRecord(record.state);
  const team = asRecord(record.team);
  const id = requiredString(record.id);
  const identifier = requiredString(record.identifier);
  const teamId = requiredString(team.id);
  const stateId = requiredString(state.id);
  if (!id || !identifier || !teamId || !stateId) return { kind: 'rejected', code: 'LINEAR_MALFORMED_ISSUE' };
  const comments = Array.isArray(asRecord(record.comments).nodes) ? asRecord(record.comments).nodes as unknown[] : [];
  return {
    kind: 'observed',
    observationId: outcome.observationId,
    value: {
      id,
      identifier,
      title: String(record.title ?? ''),
      description: String(record.description ?? ''),
      url: String(record.url ?? ''),
      teamId,
      stateId,
      stateName: String(state.name ?? ''),
      comments: comments.map((item) => ({ id: String(asRecord(item).id ?? ''), body: String(asRecord(item).body ?? '') }))
    }
  };
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
