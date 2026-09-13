'use client';

import { useEffect, useState } from 'react';

type Connection = { provider: string; mode: string; state: string; detail: string };
type Projection = {
  runId: string; phase: string; status: string; version: number; issueIdentifier: string | null;
  approvedSha: string | null; manifestHash: string | null; plannerError: string | null;
  approval: { decision: string; reviewerUserId: string | null; messageTs: string | null };
  receipt: { completed: boolean; approvedSha: string | null; observedSha: string | null; pending: string[]; outcomes: { provider: string; status: string; summary: string }[] } | null;
};
type EventItem = { sequence: number; kind: string; createdAt: string };

const stages = [
  { key: 'requested', label: 'Request', detail: 'Linear release intent' },
  { key: 'awaiting_approval', label: 'Authority', detail: 'Exact SHA frozen' },
  { key: 'publishing', label: 'Publish', detail: 'GitHub prerelease' },
  { key: 'updating_apps', label: 'Reconcile', detail: 'Linear + Slack proof' },
  { key: 'complete', label: 'Receipt', detail: 'Observed completion' }
];

export default function HomePage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [health, setHealth] = useState<'loading' | 'healthy' | 'unavailable'>('loading');
  const [password, setPassword] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [issueIdentifier, setIssueIdentifier] = useState('REL-1');
  const [releaseIntent, setReleaseIntent] = useState('Publish the approved prerelease for the linked pull request.');
  const [run, setRun] = useState<Projection | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void Promise.all([fetch('/api/health'), fetch('/api/connections')]).then(async ([healthResponse, connectionsResponse]) => {
      setHealth(healthResponse.ok ? 'healthy' : 'unavailable');
      if (connectionsResponse.ok) setConnections((await connectionsResponse.json() as { connections: Connection[] }).connections);
    }).catch(() => setHealth('unavailable'));
  }, []);

  async function refresh(runId: string) {
    const [runResponse, eventsResponse] = await Promise.all([
      fetch(`/api/runs/${runId}`, { headers: { 'x-csrf-token': csrfToken } }),
      fetch(`/api/runs/${runId}/events?after=0`, { headers: { 'x-csrf-token': csrfToken } })
    ]);
    if (runResponse.ok) setRun(await runResponse.json() as Projection);
    if (eventsResponse.ok) setEvents((await eventsResponse.json() as { events: EventItem[] }).events);
  }

  useEffect(() => {
    if (!run || !csrfToken) return;
    const timer = setInterval(() => void refresh(run.runId).catch(() => undefined), 1_000);
    return () => clearInterval(timer);
  }, [run?.runId, csrfToken]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setWorking(true);
    try {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const payload = await response.json() as { csrfToken?: string; message?: string };
      if (!response.ok || !payload.csrfToken) throw new Error(payload.message ?? 'Unable to start an operator session.');
      setCsrfToken(payload.csrfToken); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to start an operator session.'); } finally { setWorking(false); }
  }

  async function createRun(event: React.FormEvent) {
    event.preventDefault(); setWorking(true);
    try {
      const response = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ requestKey: crypto.randomUUID(), issueIdentifier, releaseIntent }) });
      const payload = await response.json() as { runId?: string; message?: string };
      if (!response.ok || !payload.runId) throw new Error(payload.message ?? 'Unable to create a run.');
      await refresh(payload.runId); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create a run.'); } finally { setWorking(false); }
  }

  async function command(kind: 'retry' | 'cancel') {
    if (!run) return; setWorking(true);
    try {
      const response = await fetch(`/api/runs/${run.runId}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ expectedVersion: run.version }) });
      if (!response.ok) throw new Error((await response.json() as { message?: string }).message ?? `Unable to ${kind} this run.`);
      await refresh(run.runId); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to ${kind} this run.`); } finally { setWorking(false); }
  }

  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.key === run?.phase));
  return <main>
    <header className="topbar"><a className="brand" href="#workspace"><span className="brand-mark">R</span><span>ReleaseProof</span></a><div className="topbar-meta"><span className={`live-dot ${health}`} />{health === 'healthy' ? 'Local runtime connected' : health === 'loading' ? 'Checking runtime' : 'Runtime needs setup'}</div></header>
    <section className="hero"><div><p className="eyebrow">Release control, built for certainty</p><h1>One approval.<br /><em>One exact release.</em></h1><p className="lede">Turn a release request into an immutable authority, a human Slack decision, and a provider-observed receipt. Every write is recoverable; nothing is assumed.</p><div className="hero-proof"><span>SHA-bound</span><span>Human-approved</span><span>Read-back verified</span></div></div><aside className="hero-card"><p className="eyebrow">Safety model</p><div className="safety-line"><b>01</b><span>Freeze the candidate SHA</span></div><div className="safety-line"><b>02</b><span>Bind the reviewer to it</span></div><div className="safety-line"><b>03</b><span>Observe each remote effect</span></div><div className="hero-card-foot">No approval can publish a different revision.</div></aside></section>
    <section className="connection-strip" aria-label="Provider connections">{connections.map((connection) => <div className="connection" key={connection.provider}><span className={`connection-dot ${connection.state}`} /><div><b>{connection.provider}</b><small>{connection.mode} · {connection.detail}</small></div></div>)}</section>
    <section id="workspace" className="workspace"><div className="workspace-heading"><div><p className="eyebrow">Operator workspace</p><h2>Release command center</h2></div><span className={`status ${run?.status ?? 'idle'}`}>{run?.status?.replaceAll('_', ' ') ?? 'Ready for a request'}</span></div>
      {!csrfToken ? <form onSubmit={(event) => void login(event)} className="login-card"><div><h3>Open the protected workspace</h3><p>Operator actions require a local signed session.</p></div><label>Operator password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label><button disabled={working} type="submit">{working ? 'Opening…' : 'Open workspace'} <span>→</span></button></form> : <>
        <form onSubmit={(event) => void createRun(event)} className="request-grid"><label><span>Linear issue</span><input value={issueIdentifier} onChange={(event) => setIssueIdentifier(event.currentTarget.value)} /></label><label className="intent"><span>Release intent</span><textarea value={releaseIntent} onChange={(event) => setReleaseIntent(event.currentTarget.value)} rows={2} /></label><button disabled={working} type="submit">{working ? 'Preparing…' : 'Prepare exact release'} <span>→</span></button></form>
        {error ? <p className="alert">{error}</p> : null}
        {run ? <div className="run-board"><div className="flow" aria-label="Release workflow">{stages.map((stage, index) => <div className={`flow-step ${index < activeIndex || run.phase === 'complete' ? 'done' : index === activeIndex ? 'active' : ''}`} key={stage.key}><span className="step-number">{index < activeIndex || run.phase === 'complete' ? '✓' : String(index + 1).padStart(2, '0')}</span><div><b>{stage.label}</b><small>{stage.detail}</small></div></div>)}</div>
          <div className="run-columns"><div className="authority-card"><div className="card-label">Immutable authority</div><div className="authority-item"><span>Issue</span><b>{run.issueIdentifier ?? 'Gathering evidence'}</b></div><div className="authority-item"><span>Approved SHA</span><code>{run.approvedSha ? short(run.approvedSha) : 'Not frozen'}</code></div><div className="authority-item"><span>Manifest hash</span><code>{run.manifestHash ? short(run.manifestHash) : 'Awaiting plan'}</code></div><div className="authority-item"><span>Slack decision</span><b className={run.approval.decision}>{run.approval.decision}{run.approval.reviewerUserId ? ` · ${run.approval.reviewerUserId}` : ''}</b></div>{run.plannerError ? <p className="recovery-note">Recovery: {run.plannerError}</p> : null}<div className="run-actions">{run.status === 'reconciling' || run.status === 'needs_attention' ? <button disabled={working} onClick={() => void command('retry')} type="button" className="secondary">Retry safely</button> : null}{run.status !== 'completed' && run.status !== 'cancelled' ? <button disabled={working} onClick={() => void command('cancel')} type="button" className="quiet">Cancel run</button> : null}</div></div>
            <div className="evidence-card"><div className="card-label">Observed receipt</div>{run.receipt?.outcomes.map((outcome) => <div className="outcome" key={outcome.provider}><span className={outcome.status === 'observed' ? 'outcome-check' : 'outcome-pending'}>{outcome.status === 'observed' ? '✓' : '·'}</span><div><b>{outcome.provider}</b><p>{outcome.summary}</p></div></div>)}<div className="event-feed"><div className="card-label">Event trail</div>{events.slice(-5).reverse().map((event) => <div className="event" key={event.sequence}><span>{String(event.sequence).padStart(2, '0')}</span><b>{humanize(event.kind)}</b><time>{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></div></div>
        </div> : <div className="empty-state"><span>✦</span><div><h3>No active release yet</h3><p>Start with a Linear issue. ReleaseProof will gather evidence before it asks anyone to approve.</p></div></div>}
      </>}
    </section><footer>ReleaseProof records observed remote state. It never treats a successful request as proof of a release.</footer>
  </main>;
}

function short(value: string) { return `${value.slice(0, 10)}…${value.slice(-6)}`; }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' '); }
