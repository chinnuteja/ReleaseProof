'use client';

import { useEffect, useState } from 'react';

type Connection = { provider: string; mode: string; state: string; detail: string };

export default function HomePage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [health, setHealth] = useState<'loading' | 'healthy' | 'unavailable'>('loading');

  useEffect(() => {
    void Promise.all([fetch('/api/health'), fetch('/api/connections')])
      .then(async ([healthResponse, connectionsResponse]) => {
        setHealth(healthResponse.ok ? 'healthy' : 'unavailable');
        const payload = await connectionsResponse.json() as { connections: Connection[] };
        setConnections(payload.connections);
      }).catch(() => setHealth('unavailable'));
  }, []);

  return <main>
    <section className="hero">
      <p className="eyebrow">ReleaseProof · Phase 1 foundation</p>
      <h1>Make release approval mean exactly what it says.</h1>
      <p className="lede">This workspace will bind approval to an immutable release manifest, observe what actually happens across GitHub, Slack, and Linear, and make uncertainty visible.</p>
    </section>
    <section aria-labelledby="connections-title" className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Runtime status</p><h2 id="connections-title">Connections</h2></div><span className={`status ${health}`}>{health === 'loading' ? 'Checking local runtime' : health}</span></div>
      <ul className="connections">
        {connections.map((connection) => <li key={connection.provider}><strong>{connection.provider}</strong><span>{connection.mode}</span><span className="muted">{connection.state} · {connection.detail}</span></li>)}
      </ul>
      <p className="footnote">No external provider mutation occurs from this screen. Real credentials are intentionally not exposed here.</p>
    </section>
  </main>;
}
