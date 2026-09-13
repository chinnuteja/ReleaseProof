import type { ProviderMode, SlackInteraction } from '@releaseproof/contracts';
import type { ObservedCheck } from '../domain/checks.js';

export type Clock = { now(): Date };

export type Outcome<T = unknown> =
  | { kind: 'observed'; observationId: string; value: T }
  | { kind: 'not_sent'; reason: string }
  | { kind: 'rejected'; code: string; retryAfterMs?: number }
  | { kind: 'unknown'; reason: string }
  | { kind: 'unsupported'; capability: string };

export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  htmlUrl: string;
  merged: boolean;
  repositoryFullName: string;
  repositoryId: string;
};

export type GitHubRelease = {
  id: string;
  tagName: string;
  targetCommitish: string;
  name: string;
  body: string;
  prerelease: boolean;
  htmlUrl: string;
};

export type GitHubPort = {
  mode: ProviderMode;
  healthCheck(): Promise<Outcome>;
  capabilityCheck(): Promise<Outcome>;
  readRepository(): Promise<Outcome<{ id: string; fullName: string }>>;
  readPullRequest(number: number): Promise<Outcome<GitHubPullRequest>>;
  readChecks(sha: string): Promise<Outcome<ObservedCheck[]>>;
  readReleaseByTag(tagName: string): Promise<Outcome<GitHubRelease | null>>;
  resolveTagCommit(tagName: string): Promise<Outcome<string | null>>;
  createPrerelease(input: { tagName: string; commitSha: string; name: string; body: string }): Promise<Outcome<GitHubRelease>>;
};

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  teamId: string;
  stateId: string;
  stateName: string;
  comments: { id: string; body: string }[];
};

export type LinearPort = {
  mode: ProviderMode;
  healthCheck(): Promise<Outcome>;
  capabilityCheck(): Promise<Outcome>;
  readIssue(identifier: string): Promise<Outcome<LinearIssue>>;
  updateIssueState(issueId: string, stateId: string): Promise<Outcome<LinearIssue>>;
  createReceiptComment(issueId: string, body: string): Promise<Outcome<{ id: string; body: string }>>;
};

export type SlackMessage = {
  channelId: string;
  ts: string;
  text: string;
};

export type SlackPort = {
  mode: ProviderMode;
  healthCheck(): Promise<Outcome>;
  capabilityCheck(): Promise<Outcome>;
  postMessage(channelId: string, text: string, metadata?: Record<string, string>): Promise<Outcome<SlackMessage>>;
  updateMessage(channelId: string, ts: string, text: string): Promise<Outcome<SlackMessage>>;
  readMessage(channelId: string, ts: string): Promise<Outcome<SlackMessage | null>>;
  findMessage(channelId: string, marker: string): Promise<Outcome<SlackMessage | null>>;
};

export type ModelTurn =
  | { kind: 'tool_calls'; calls: { id: string; name: string; arguments: Record<string, unknown> }[]; context?: unknown[] }
  | { kind: 'proposal'; proposal: unknown }
  | { kind: 'refusal'; reason: string }
  | { kind: 'malformed'; reason: string }
  | { kind: 'incomplete'; reason: string };

export type ModelPort = {
  complete(input: {
    instructions: string;
    messages: unknown[];
    tools: { name: string; description: string; parameters: unknown }[];
  }): Promise<ModelTurn>;
};

export type ApprovalIngress = {
  ingest(interaction: SlackInteraction): Promise<{ duplicate: boolean; accepted: boolean; code?: string; message: string }>;
};
