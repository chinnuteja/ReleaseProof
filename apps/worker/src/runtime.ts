import {
  createEvidenceFollowingModel,
  createGitHubAdapter,
  createLinearAdapter,
  createOpenAIModel,
  createSlackAdapter,
  loadEnvironmentRegistry,
  type WorkflowPorts
} from '@releaseproof/core';

export function createConfiguredWorkerRuntime(environment: NodeJS.ProcessEnv): {
  ports: WorkflowPorts;
  slackAppToken?: string;
} {
  const mode = environment.RELEASEPROOF_MODE === 'real_test' ? 'real_test' : 'fixture';
  if (mode === 'real_test') {
    const missing = ['GITHUB_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'LINEAR_API_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL']
      .filter((name) => !environment[name]);
    if (missing.length > 0) throw new Error(`Real-test worker is missing required settings: ${missing.join(', ')}.`);
  }
  const loaded = loadEnvironmentRegistry({ mode, path: environment.RELEASEPROOF_ENVIRONMENT_PATH });
  const transport = { fetch };
  const github = createGitHubAdapter({
    mode,
    baseUrl: loaded.environment.github.baseUrl,
    repositoryFullName: loaded.environment.repositoryFullName,
    token: environment.GITHUB_TOKEN,
    transport
  });
  const slack = createSlackAdapter({
    mode,
    baseUrl: loaded.environment.slack.baseUrl,
    token: environment.SLACK_BOT_TOKEN,
    transport
  });
  const linear = createLinearAdapter({
    mode,
    baseUrl: loaded.environment.linear.baseUrl,
    apiKey: environment.LINEAR_API_KEY,
    transport
  });

  const model = mode === 'real_test'
    ? createOpenAIModel(environment.OPENAI_API_KEY!, environment.OPENAI_MODEL!)
    : createEvidenceFollowingModel(loaded.environment);
  const ports: WorkflowPorts = {
    github,
    slack,
    linear,
    model,
    environment: loaded.environment,
    clock: { now: () => new Date() }
  };
  const slackAppToken = mode === 'real_test' ? environment.SLACK_APP_TOKEN : undefined;
  return slackAppToken ? { ports, slackAppToken } : { ports };
}
