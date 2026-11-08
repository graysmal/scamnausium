import type { DecoyEvents, DecoySessions, Campaigns } from '../module_bindings/types';
import { timeAgo, toMs } from '../lib/format';

/** First-party mock collector: what a scammer's harvested list looks like once decoys are mixed in. */
export function CollectorView({events, sessions, campaigns}: {events: readonly DecoyEvents[]; sessions: readonly DecoySessions[]; campaigns: readonly Campaigns[]}) {
  const decoys = events.filter(e => e.kind === 'synthetic_decoy').length;
  const share = events.length ? Math.round((decoys / events.length) * 100) : 0;
  const recent = [...events].sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp)).slice(0, 40);
  const campaignOf = (sessionId: string) => campaigns.find(c => c.id === sessions.find(s => s.id === sessionId)?.campaignId)?.label ?? '—';
  return (
    <div className="collector">
      <header className="collector-head">
        <div>
          <p className="eyebrow">Mock collector · first-party simulation</p>
          <h1>{share}% of the harvested list is decoys</h1>
          <p className="quiet">{events.length} records · {decoys} decoys · {sessions.length} session{sessions.length === 1 ? '' : 's'}. Measured on this simulated dataset only, never on real scammer infrastructure.</p>
        </div>
      </header>
      <div className="meter" role="meter" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label="Decoy share"><span style={{width: `${share}%`}} /></div>
      {recent.length ? (
        <table className="table">
          <thead><tr><th>Record</th><th>Campaign</th><th>Type</th><th>Added</th></tr></thead>
          <tbody>{recent.map(e => (
            <tr key={e.id}>
              <td className="mono">{e.sessionId.slice(0, 6)} · #{String(Number(e.id.split('-').pop()) + 1).padStart(2, '0')}</td>
              <td>{campaignOf(e.sessionId)}</td>
              <td>{e.kind === 'synthetic_decoy' ? <span className="tag decoy">Decoy</span> : <span className="tag">Baseline</span>}</td>
              <td className="quiet">{timeAgo(e.timestamp)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="quiet">Select a campaign in the network and run a decoy session.</p>}
    </div>
  );
}
