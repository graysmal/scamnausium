import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import { NetworkGraph } from './components/NetworkGraph';
import { OperatorRail } from './components/OperatorRail';
import { Inspector, type ScamData } from './components/Inspector';
import { CustomerView } from './views/CustomerView';
import { CollectorView } from './views/CollectorView';
import { SetupView } from './views/SetupView';
import { buildElements, type Selection } from './lib/graph';
import { duration } from './lib/format';
import { ApiError, postAction, postReport, useGatewayStatus, type Action, type ProviderState } from './lib/api';
import './style.css';

type View = 'network' | 'customer' | 'collector' | 'setup';
const VIEWS: {id: View; label: string}[] = [
  {id: 'network', label: 'Network'},
  {id: 'customer', label: 'Customer'},
  {id: 'collector', label: 'Collector'},
  {id: 'setup', label: 'Setup'},
];

/** URL hash mirrors view + selection (e.g. #network/i/<id>, #customer) so demo states can be bookmarked. */
function readHash(): {view: View; selection: Selection} {
  const [rawView, kind, ...rest] = window.location.hash.replace(/^#\/?/, '').split('/');
  const view = VIEWS.some(v => v.id === rawView) ? rawView as View : 'network';
  const id = decodeURIComponent(rest.join('/'));
  const map = {i: 'incident', c: 'campaign', x: 'indicator'} as const;
  const selection = id && kind in map ? {kind: map[kind as keyof typeof map], id} : null;
  return {view, selection};
}
function writeHash(view: View, selection: Selection) {
  const code = {incident: 'i', campaign: 'c', indicator: 'x'} as const;
  const short = selection ? `/${code[selection.kind]}/${encodeURIComponent(selection.id)}` : '';
  const next = `#${view}${short}`;
  if (window.location.hash !== next) window.history.replaceState(null, '', next);
}

const SECRET_KEY = 'scamnasium.operator';
function readSecret(): string {
  try { return sessionStorage.getItem(SECRET_KEY) ?? ''; } catch { return ''; }
}
function writeSecret(value: string) {
  try { if (value) sessionStorage.setItem(SECRET_KEY, value); else sessionStorage.removeItem(SECRET_KEY); } catch { /* storage unavailable: keep in memory only */ }
}

function StatusDot({label, state, title}: {label: string; state: ProviderState; title: string}) {
  return <span className={`status status-${state}`} title={title}><i aria-hidden />{label}</span>;
}

export default function App() {
  const {isActive} = useSpacetimeDB();
  const [incidents] = useTable(tables.incidents);
  const [campaigns] = useTable(tables.campaigns);
  const [indicators] = useTable(tables.indicators);
  const [interventions] = useTable(tables.interventions);
  const [calls] = useTable(tables.calls);
  const [sessions] = useTable(tables.decoySessions);
  const [events] = useTable(tables.decoyEvents);
  const status = useGatewayStatus();

  const [view, setView] = useState<View>(() => readHash().view);
  const [selection, setSelection] = useState<Selection>(() => readHash().selection);
  useEffect(() => writeHash(view, selection), [view, selection]);
  useEffect(() => {
    const onHash = () => { const h = readHash(); setView(h.view); setSelection(h.selection); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [secret, setSecretState] = useState(readSecret);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{tone: 'error' | 'info'; text: string} | null>(null);

  const setSecret = useCallback((value: string) => { setSecretState(value); writeSecret(value); }, []);
  const data: ScamData = useMemo(() => ({incidents, campaigns, indicators, interventions, calls}), [incidents, campaigns, indicators, interventions, calls]);
  const elements = useMemo(() => buildElements(incidents, campaigns, indicators, calls), [incidents, campaigns, indicators, calls]);
  const incidentIds = useMemo(() => new Set(incidents.map(i => i.id)), [incidents]);
  const canAct = Boolean(secret) && isActive && !busy;

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setNotice(null);
    try {
      return await task();
    } catch (error) {
      setNotice({tone: 'error', text: error instanceof ApiError ? error.message : 'Something went wrong.'});
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const onAction = (action: Action) => void run(async () => {
    const result = await postAction(secret, action);
    if (action.action === 'reset') setSelection(null);
    if (result.incidentId) setSelection({kind: 'incident', id: result.incidentId});
  });

  const onReport = async (text: string, channel: 'auto' | 'sms' | 'email' | 'imessage') => {
    const result = await run(() => postReport(secret, text, channel));
    if (!result) return false;
    setSelection({kind: 'incident', id: result.incidentId});
    if (result.outcome === 'duplicate') setNotice({tone: 'info', text: 'Already reported. Showing the existing record.'});
    setView('network');
    return true;
  };

  const liveCalls = calls.filter(c => c.status === 'in_progress' || c.status === 'ringing').length;
  // Measured from real honeypot calls only (simulated scenarios never create call rows).
  const wastedSecs = calls.reduce((sum, c) => sum + c.durationSecs, 0);
  const decoyShare = events.length ? Math.round((events.filter(e => e.kind === 'synthetic_decoy').length / events.length) * 100) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">scamnasium</div>
        <nav className="tabs" aria-label="Views">
          {VIEWS.map(v => <button key={v.id} type="button" aria-current={view === v.id ? 'page' : undefined} onClick={() => setView(v.id)}>{v.label}</button>)}
        </nav>
        <div className="statuses">
          <StatusDot label="Database" state={isActive ? 'verified' : 'error'} title={isActive ? 'Connected' : 'Disconnected'} />
          <StatusDot label="Calls" state={status.voice.state} title={status.voice.detail} />
          <StatusDot label="iMessage" state={status.messaging.state} title={status.messaging.detail} />
        </div>
      </header>

      <div className="body">
        <OperatorRail secret={secret} onSecret={setSecret} busy={busy} calls={calls} status={status}
          onReport={onReport} onAction={onAction} incidentIds={incidentIds}
          onOpenIncident={id => { setSelection({kind: 'incident', id}); setView('network'); }} />

        <main className="main">
          {!isActive && <div className="notice notice-error" role="alert">Not connected to the database. Start it with <span className="mono">spacetime start</span>, then reload.</div>}
          {isActive && !status.reachable && <div className="notice notice-error" role="alert">Gateway is not running. Start it with <span className="mono">npm run gateway</span> to use controls and see calls.</div>}
          {notice && <div className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}<button type="button" className="link" onClick={() => setNotice(null)}>Dismiss</button></div>}
          {view === 'network' && (
            <div className="network">
              <div className="center">
                <dl className="stats">
                  <div><dt>Reports</dt><dd>{incidents.length}</dd></div>
                  <div><dt>Campaigns</dt><dd>{campaigns.length}</dd></div>
                  <div><dt>Honeypot calls</dt><dd>{calls.length}{liveCalls > 0 && <small className="live-count"> · {liveCalls} live</small>}</dd></div>
                  <div><dt>Caller time wasted</dt><dd>{duration(wastedSecs)}</dd></div>
                  <div><dt>Decoy share</dt><dd>{decoyShare}%</dd></div>
                </dl>
                <NetworkGraph elements={elements} selection={selection} onSelect={setSelection} />
              </div>
              <div className="inspector">
                {selection && <button type="button" className="link back" onClick={() => setSelection(null)}>← Latest reports</button>}
                <Inspector data={data} selection={selection} onSelect={setSelection} onAction={onAction} canAct={canAct} />
              </div>
            </div>
          )}
          {view === 'customer' && <CustomerView data={data} focusId={selection?.kind === 'incident' ? selection.id : undefined} onFocus={id => setSelection({kind: 'incident', id})} />}
          {view === 'collector' && <CollectorView events={events} sessions={sessions} campaigns={campaigns} />}
          {view === 'setup' && <SetupView status={status} dbActive={isActive} />}
        </main>
      </div>

      <footer className="footnote">Scenario data is simulated. Real calls and messages come only from the team’s own test phones. Detection shows warning signs, not verdicts.</footer>
    </div>
  );
}
