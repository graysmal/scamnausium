import { useDeferredValue, useMemo, useState } from 'react';
import type { Incidents } from '../module_bindings/types';
import type { ScamData } from '../components/Inspector';
import { CHANNEL_LABEL, provenance, toMs } from '../lib/format';
import { analyze, isLinkable, sanitizeSummary, MAX_REPORT_LENGTH, VERDICT_TITLE } from '../../spacetimedb/src/domain';
import { compactEmail } from '../../spacetimedb/src/email';

type Risk = keyof typeof VERDICT_TITLE;

const LEAD: Record<Risk, string> = {
  high: 'Several warning signs point the same way.',
  medium: 'Some warning signs are present. Treat it with caution.',
  low: 'We did not find common warning signs. Stay careful with links and codes.',
};

interface Card {
  channel: string;
  risk: Risk;
  confidence: string;
  headline: string;
  signals: {id: string; text: string}[];
  advice?: string;
  match?: {label: string; count: number};
  fine: string;
}

interface Props {
  data: ScamData;
  focusId?: string;
  onFocus: (id: string) => void;
  canReport: boolean;
  onReport: (text: string) => Promise<boolean>;
}

/** What the protected customer sees: plain language, one next step, honest confidence. */
export function CustomerView({data, focusId, onFocus, canReport, onReport}: Props) {
  const [draft, setDraft] = useState('');
  const deferred = useDeferredValue(draft);
  const ordered = useMemo(() => [...data.incidents].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)), [data.incidents]);
  const incident: Incidents | undefined = ordered.find(i => i.id === focusId) ?? ordered[0];

  // A pasted message is analyzed right here in the browser. Nothing leaves the page unless the person reports it.
  const local = useMemo(() => {
    if (!deferred.trim()) return undefined;
    const text = sanitizeSummary(compactEmail(deferred), MAX_REPORT_LENGTH);
    return {text, analysis: analyze(text)};
  }, [deferred]);

  let card: Card | undefined;
  if (local) {
    const a = local.analysis;
    const campaign = isLinkable(a.key) ? data.campaigns.find(c => c.id === a.key) : undefined;
    card = {
      channel: a.senderDomain || /^from:/im.test(local.text) ? 'email' : 'message',
      risk: a.riskLevel, confidence: a.confidence, headline: a.headline,
      signals: [...a.signals].sort((x, y) => y.weight - x.weight).slice(0, 4).map(s => ({id: s.id, text: s.label})),
      advice: a.riskLevel === 'low' ? undefined : a.recommendation,
      match: campaign ? {label: campaign.label, count: campaign.incidentCount} : undefined,
      fine: 'Checked on this device. Nothing was sent or saved.',
    };
  } else if (incident) {
    const risk = (incident.riskLevel in LEAD ? incident.riskLevel : 'low') as Risk;
    const campaign = data.campaigns.find(c => c.id === incident.campaignId);
    card = {
      channel: (CHANNEL_LABEL[incident.channel] ?? 'message').toLowerCase(),
      risk, confidence: incident.confidenceLabel, headline: incident.headline,
      signals: data.indicators.filter(i => i.incidentId === incident.id && i.kind === 'signal').sort((a, b) => b.weight - a.weight).slice(0, 4).map(s => ({id: s.id, text: s.displayValue})),
      advice: data.interventions.find(i => i.incidentId === incident.id)?.recommendation,
      match: campaign && campaign.incidentCount > 1 ? {label: campaign.label, count: campaign.incidentCount} : undefined,
      fine: provenance(incident.sourceKind).tone === 'sim' ? 'This example is simulated.' : 'We keep only a cleaned summary: no phone numbers or full addresses.',
    };
  }

  const [sent, setSent] = useState(false);
  async function report() {
    if (await onReport(draft)) { setDraft(''); setSent(true); }
  }

  return (
    <div className="customer">
      <section className="customer-check">
        <p className="eyebrow">Check it yourself</p>
        <h1>Got a message that feels off?</h1>
        <p className="quiet">Paste a text or an email. It's checked right here in your browser, and nothing is sent anywhere unless you choose to report it.</p>
        <textarea value={draft} onChange={e => { setDraft(e.target.value); setSent(false); }} rows={8} maxLength={500_000}
          placeholder="Paste the message, links included" aria-label="Message to check" />
        <div className="row">
          {draft ? <button type="button" className="link" onClick={() => setDraft('')}>Clear</button> : <span />}
          {local && local.analysis.riskLevel !== 'low' && (
            <button type="button" className="primary" disabled={!canReport} onClick={report}
              title={canReport ? undefined : 'Enter the operator key on the Network tab to report'}>Report to protect others</button>
          )}
        </div>
        {sent && <p className="hint">Reported. It's now linked with similar reports in the network.</p>}
        {!draft && ordered.length > 0 && (
          <label className="customer-pick">
            <span className="field-label">Or view a reported message</span>
            <select value={incident?.id} onChange={e => onFocus(e.target.value)}>
              {ordered.map(i => <option key={i.id} value={i.id}>{(CHANNEL_LABEL[i.channel] ?? i.channel) + ' · ' + i.headline.slice(0, 60)}</option>)}
            </select>
          </label>
        )}
      </section>

      {card ? (
        <section className="phone" aria-label="Customer notification" aria-live="polite">
          <p className="phone-from">Scamnasium · about your {card.channel}</p>
          <h1 className={`verdict risk-${card.risk}`}>{VERDICT_TITLE[card.risk]}</h1>
          <p>{LEAD[card.risk]}</p>
          <blockquote>{card.headline}</blockquote>
          {card.match && (
            <p className="phone-match">Matches a known campaign: <strong>{card.match.label}</strong>, reported {card.match.count} {card.match.count === 1 ? 'time' : 'times'}.</p>
          )}
          {card.signals.length > 0 && (
            <>
              <h2>What we noticed</h2>
              <ul>{card.signals.map(s => <li key={s.id}>{s.text}</li>)}</ul>
            </>
          )}
          {card.advice && (
            <div className="phone-step">
              <h2>Do this next</h2>
              <p>{card.advice}</p>
            </div>
          )}
          <p className="phone-fine">
            Confidence: {card.confidence}. These are warning signs, not proof about the sender. Nothing was blocked automatically. {card.fine}
          </p>
        </section>
      ) : <p className="quiet">No reports yet. Paste a message to check it.</p>}
    </div>
  );
}
