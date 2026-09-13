import { SocketModeClient } from '@slack/socket-mode';
import type { SlackInteraction } from '@releaseproof/contracts';
import { APPROVAL_ACTION_ID, ingestApproval, type ReleaseProofDatabase, type WorkflowPorts } from '@releaseproof/core';

export function ingestSlackInteraction(database: ReleaseProofDatabase, interaction: SlackInteraction, ports: WorkflowPorts) {
  return ingestApproval(database, interaction, ports);
}

export async function startSlackSocketMode(input: {
  appToken: string;
  database: ReleaseProofDatabase;
  ports: WorkflowPorts;
}): Promise<{ stop(): Promise<void> }> {
  const client = new SocketModeClient({ appToken: input.appToken });
  client.on('interactive', async ({ body, ack }) => {
    const action = Array.isArray(body?.actions) ? body.actions[0] : undefined;
    const value = typeof action?.value === 'string' ? action.value : '';
    const [intentId, nonce] = value.split(':');
    const interaction: SlackInteraction = {
      transportDedupeKey: String(body?.trigger_id ?? `${body?.user?.id}:${body?.message?.ts}:${action?.action_ts ?? ''}`),
      appId: String(body?.api_app_id ?? ''),
      teamId: String(body?.team?.id ?? ''),
      channelId: String(body?.channel?.id ?? ''),
      messageTs: String(body?.message?.ts ?? ''),
      userId: String(body?.user?.id ?? ''),
      actionId: String(action?.action_id ?? APPROVAL_ACTION_ID),
      intentId: intentId ?? '',
      nonce: nonce ?? ''
    };
    const result = ingestApproval(input.database, interaction, input.ports);
    await ack();
    if (!result.accepted) process.stderr.write(`Rejected Slack approval interaction: ${result.code ?? 'INVALID_REQUEST'}\n`);
  });
  await client.start();
  return { stop: () => client.disconnect() };
}
