import type { Incidents } from '../module_bindings/types';
import type { ScamData } from '../components/Inspector';
import { CHANNEL_LABEL, provenance, toMs } from '../lib/format';

const VERDICT: Record<string, {title: string; lead: string}> = {
  high: {title: 'This is very likely a scam', lead: 'Several warning signs point the same way.'},
  medium: {title: 'This looks suspicious', lead: 'Some warning signs are present. Treat it with caution.'},
  low: {title: 'No clear scam pattern', lead: 'We did not find common warning signs. Stay careful with links and codes.'},
};

/** What the protected customer sees: plain language, one next step, honest confidence. */
export function CustomerView({data, focusId, onFocus}: {data: ScamData; focusId?: string; onFocus: (id: string) => void}) {
  const ordered = [...data.incidents].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const incident: Incidents | undefined = ordered.find(i => i.id === focusId) ?? ordered[0];
  if (!incident) return <div className="customer"><p className="quiet">No reports yet.</p></div>;
  const verdict = VERDICT[incident.riskLevel] ?? VERDICT.low;
  const signals = data.indicators.filter(i => i.incidentId === incident.id && i.kind === 'signal').sort((a, b) => b.weight - a.weight).slice(0, 4);
  const guidance = data.interventions.find(i => i.incidentId === incident.id);
  const p = provenance(incident.sourceKind);
  return (
    <div className="customer">
      <label className="customer-pick">
        <span className="field-label">Showing</span>
        <select value={incident.id} onChange={e => onFocus(e.target.value)}>
          {ordered.map(i => <option key={i.id} value={i.id}>{(CHANNEL_LABEL[i.channel] ?? i.channel) + ' · ' + i.headline.slice(0, 60)}</option>)}
        </select>
      </label>
      <section className="phone" aria-label="Customer notification">
        <p className="phone-from">Scamnasium · about your {(CHANNEL_LABEL[incident.channel] ?? 'message').toLowerCase()}</p>
        <h1 className={`verdict risk-${incident.riskLevel}`}>{verdict.title}</h1>
        <p>{verdict.lead}</p>
        <blockquote>{incident.headline}</blockquote>
        {signals.length > 0 && (
          <>
            <h2>What we noticed</h2>
            <ul>{signals.map(s => <li key={s.id}>{s.displayValue}</li>)}</ul>
          </>
        )}
        {guidance && (
          <div className="phone-step">
            <h2>Do this next</h2>
            <p>{guidance.recommendation}</p>
          </div>
        )}
        <p className="phone-fine">
          Confidence: {incident.confidenceLabel}. These are warning signs, not proof about the sender. Nothing was blocked automatically.
          {p.tone === 'sim' ? ' This example is simulated.' : ' We keep only a cleaned summary: no phone numbers or full addresses.'}
        </p>
      </section>
    </div>
  );
}
