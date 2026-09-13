import { createServer } from 'node:http';

export type FixtureServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.local');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/health') return void response.end(JSON.stringify({ ok: true, provider: 'fixture' }));
    if (url.pathname === '/linear/graphql-error') return void response.end(JSON.stringify({ data: null, errors: [{ message: 'fixture GraphQL failure' }] }));
    if (url.pathname === '/unsupported') {
      response.statusCode = 501;
      return void response.end(JSON.stringify({ code: 'CAPABILITY_UNSUPPORTED' }));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 'NOT_FOUND' }));
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
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise()))
  };
}
