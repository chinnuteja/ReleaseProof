import OpenAI from 'openai';
import { PlannerProposalSchema } from '@releaseproof/contracts';
import type { ModelPort } from '../providers/ports.js';

export function createOpenAIModel(apiKey: string, model: string): ModelPort {
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  return {
    async complete({ instructions, messages, tools }) {
      const response = await client.responses.create({
        model,
        instructions,
        input: messages as never,
        tools: tools.map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as never,
          strict: true
        })),
        parallel_tool_calls: false,
        max_output_tokens: 20_000,
        text: { format: { type: 'json_schema', name: 'release_proposal', strict: true, schema: toJsonSchema() } }
      });
      if (response.status === 'incomplete') return { kind: 'incomplete', reason: response.incomplete_details?.reason ?? 'incomplete' };
      const refusal = response.output.find((item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'));
      if (refusal) return { kind: 'refusal', reason: 'The model refused to produce a proposal.' };
      const toolCalls = response.output.filter((item) => item.type === 'function_call');
      if (toolCalls.length > 0) {
        try {
          return {
            kind: 'tool_calls',
            context: response.output,
            calls: toolCalls.map((item) => ({
              id: item.call_id,
              name: item.name,
              arguments: JSON.parse(item.arguments || '{}') as Record<string, unknown>
            }))
          };
        } catch {
          return { kind: 'malformed', reason: 'Model returned malformed tool arguments.' };
        }
      }
      const text = response.output_text;
      if (!text) return { kind: 'malformed', reason: 'Model returned no structured proposal.' };
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { kind: 'malformed', reason: 'Model returned malformed proposal JSON.' };
      }
      const parsed = PlannerProposalSchema.safeParse(json);
      if (!parsed.success) return { kind: 'malformed', reason: 'Model JSON did not match the proposal schema.' };
      return { kind: 'proposal', proposal: parsed.data };
    }
  };
}

export async function smokeTestStructuredOutput(apiKey: string, model: string): Promise<{ ok: true; model: string } | { ok: false; reason: string }> {
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const response = await client.responses.create({
    model,
    input: 'Return a harmless proposal title for a fixture prerelease. Do not mention secrets.',
    text: {
      format: {
        type: 'json_schema',
        name: 'smoke',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { title: { type: 'string' } },
          required: ['title']
        }
      }
    }
  });
  const parsed = JSON.parse(response.output_text || '{}') as { title?: unknown };
  if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) return { ok: false, reason: 'Structured output was missing a title.' };
  return { ok: true, model };
}

function toJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['issueId', 'issueIdentifier', 'pullRequestNumber', 'repositoryFullName', 'commitSha', 'tagName', 'releaseTitle', 'releaseBody', 'requiredChecks', 'linearTeamId', 'issues', 'slackTeamId', 'slackChannelId'],
    properties: {
      issueId: { type: 'string' },
      issueIdentifier: { type: 'string' },
      pullRequestNumber: { type: 'integer' },
      repositoryFullName: { type: 'string' },
      commitSha: { type: 'string' },
      tagName: { type: 'string' },
      releaseTitle: { type: 'string' },
      releaseBody: { type: 'string' },
      requiredChecks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'appId', 'headSha'],
          properties: { name: { type: 'string' }, appId: { type: 'string' }, headSha: { type: 'string' } }
        }
      },
      linearTeamId: { type: 'string' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['issueId', 'releasedStateId'],
          properties: { issueId: { type: 'string' }, releasedStateId: { type: 'string' } }
        }
      },
      slackTeamId: { type: 'string' },
      slackChannelId: { type: 'string' }
    }
  };
}
