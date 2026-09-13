import type { ProviderMode } from '@releaseproof/contracts';
import type { Outcome } from './ports.js';
import type { SlackMessage, SlackPort } from './ports.js';
import { requestJson } from './http.js';
import type { Transport } from './transport.js';
import { assertFixtureUrl } from './transport.js';

export function createSlackAdapter(options: {
  mode: ProviderMode;
  baseUrl: string;
  token?: string | undefined;
  transport: Transport;
}): SlackPort {
  if (options.mode === 'fixture') assertFixtureUrl(options.baseUrl);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const methodUrl = (method: string) => `${trimSlash(options.baseUrl)}/${method}`;

  return {
    mode: options.mode,
    healthCheck: () => requestJson(options.transport, methodUrl('auth.test'), { headers, method: 'POST', body: '{}' }),
    capabilityCheck: async () => {
      const outcome = await requestJson(options.transport, methodUrl('auth.test'), { headers, method: 'POST', body: '{}' });
      if (outcome.kind !== 'observed') return outcome;
      return { kind: 'observed', observationId: outcome.observationId, value: { capabilities: ['chat.write', 'conversations.history', 'socket_mode'] } };
    },
    postMessage: async (channelId, text, metadata) => {
      const intentId = metadata?.intentId;
      const nonce = metadata?.nonce;
      const actionId = metadata?.actionId;
      const approval = intentId && nonce && actionId ? {
        metadata: {
          event_type: 'releaseproof_approval',
          event_payload: { intent_id: intentId, nonce }
        },
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text } },
          {
            type: 'actions',
            elements: [{
              type: 'button',
              action_id: actionId,
              style: 'primary',
              text: { type: 'plain_text', text: 'Approve release' },
              value: `${intentId}:${nonce}`,
              confirm: {
                title: { type: 'plain_text', text: 'Approve this exact release?' },
                text: { type: 'mrkdwn', text: 'This authorizes the repository, tag, and commit shown above.' },
                confirm: { type: 'plain_text', text: 'Approve' },
                deny: { type: 'plain_text', text: 'Cancel' }
              }
            }]
          }
        ]
      } : {};
      return mapMessage(await requestJson(options.transport, methodUrl('chat.postMessage'), {
        headers,
        method: 'POST',
        body: JSON.stringify({ channel: channelId, text, ...approval })
      }));
    },
    updateMessage: async (channelId, ts, text) => mapMessage(await requestJson(options.transport, methodUrl('chat.update'), {
      headers,
      method: 'POST',
      body: JSON.stringify({ channel: channelId, ts, text })
    })),
    readMessage: async (channelId, ts) => {
      const outcome = await requestJson(options.transport, methodUrl('conversations.history'), {
        headers,
        method: 'POST',
        body: JSON.stringify({ channel: channelId, latest: ts, inclusive: true, limit: 1 })
      });
      if (outcome.kind !== 'observed') return outcome;
      const messages = Array.isArray(asRecord(outcome.value).messages) ? asRecord(outcome.value).messages as unknown[] : [];
      const first = messages[0];
      return {
        kind: 'observed',
        observationId: outcome.observationId,
        value: first ? { channelId, ts: String(asRecord(first).ts ?? ts), text: String(asRecord(first).text ?? '') } : null
      };
    },
    findMessage: async (channelId, marker) => {
      const outcome = await requestJson(options.transport, methodUrl('conversations.history'), {
        headers,
        method: 'POST',
        body: JSON.stringify({ channel: channelId, limit: 100 })
      });
      if (outcome.kind !== 'observed') return outcome;
      const messages = Array.isArray(asRecord(outcome.value).messages) ? asRecord(outcome.value).messages as unknown[] : [];
      const found = messages.map(asRecord).find((message) => String(message.text ?? '').includes(marker));
      return {
        kind: 'observed',
        observationId: outcome.observationId,
        value: found ? { channelId, ts: String(found.ts ?? ''), text: String(found.text ?? '') } : null
      };
    }
  };
}

function mapMessage(outcome: Outcome<unknown>): Outcome<SlackMessage> {
  if (outcome.kind !== 'observed') return outcome;
  const record = asRecord(outcome.value);
  const message = asRecord(record.message);
  return {
    kind: 'observed',
    observationId: outcome.observationId,
    value: {
      channelId: String(record.channel ?? message.channel ?? ''),
      ts: String(record.ts ?? message.ts ?? ''),
      text: String(message.text ?? record.text ?? '')
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}
