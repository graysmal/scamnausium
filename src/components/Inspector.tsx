import { useState } from 'react';
import type { Calls, Campaigns, Incidents, Indicators, Interventions } from '../module_bindings/types';
import { CHANNEL_LABEL, RISK_LABEL, STATUS_STEPS, duration, provenance, timeAgo, toMs } from '../lib/format';
import { sharedIndicators, type Selection } from '../lib/graph';
import type { Action } from '../lib/api';
import { parseMessage } from '../../spacetimedb/src/domain';

export interface ScamData {
  incidents: readonly Incidents[];
  campaigns: readonly Campaigns[];
  indicators: readonly Indicators[];
  interventions: readonly Interventions[];
  calls: readonly Calls[];
}

interface Props {
  data: ScamData;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAction: (a: Action) => void;
  canAct: boolean;
}

function Steps({status}: {status: string}) {
  const reached = STATUS_STEPS.indexOf(status as (typeof STATUS_STEPS)[number]);
  return (
    <ol className="steps" aria-label={`Status: ${status}`}>
      {STATUS_STEPS.map((s, i) => <li key={s} className={i <= reached ? 'done' : ''}>{s}</li>)}
    </ol>
  );
}

function IncidentRow({incident, campaign, onSelect}: {incident: Incidents; campaign?: Campaigns; onSelect: (s: Selection) => void}) {
  const p = provenance(incident.sourceKind);
  return (
    <li>
      <button type="button" className="row-button" onClick={() => onSelect({kind: 'incident', id: incident.id})}>
        <span className={`risk-mark risk-${incident.riskLevel}`} aria-label={RISK_LABEL[incident.riskLevel]} />
        <span className="row-main">
          <span className="row-title">{incident.headline}</span>
          <span className="row-meta">{CHANNEL_LABEL[incident.channel] ?? incident.channel} · <span className={`tone-${p.tone}`}>{p.label}</span>{campaign ? ` · ${campaign.label}` : ''}</span>
        </span>
        <span className="row-time">{timeAgo(incident.createdAt)}</span>
      </button>
    </li>
  );
}

function IncidentDetail({incident, data, onSelect, onAction, canAct}: {incident: Incidents} & Omit<Props, 'selection'>) {
  const campaign = data.campaigns.find(c => c.id === incident.campaignId);
  const signals = data.indicators.filter(i => i.incidentId === incident.id && i.kind === 'signal').sort((a, b) => b.weight - a.weight);
  const facts = [...new Map(data.indicators.filter(i => i.incidentId === incident.id && i.kind !== 'signal').map(f => [f.fingerprint, f])).values()];
  const [showAll, setShowAll] = useState(false);
  const visibleSignals = showAll ? signals : signals.slice(0, 4);
  const guidance = data.interventions.find(i => i.incidentId === incident.id);
  const call = data.calls.find(c => c.id === incident.id);
  const p = provenance(incident.sourceKind);
  const canProtect = incident.status === 'analyzed' || incident.status === 'linked';
  const parsed = parseMessage(incident.summary);
  const body = parsed.body || incident.summary;
  const authLine = incident.summary.match(/^Auth:\s*(.*)$/im)?.[1];
  return (
    <article className="detail">
      <p className="eyebrow">{CHANNEL_LABEL[incident.channel] ?? incident.channel} · <span className={`tone-${p.tone}`}>{p.label}</span> · {timeAgo(incident.createdAt)}</p>
      <h2 className="detail-title">{incident.headline}</h2>
      <p className={`risk-line risk-${incident.riskLevel}`}>{RISK_LABEL[incident.riskLevel]} <span className="quiet">· {incident.confidenceLabel} confidence</span></p>
      <Steps status={incident.status} />

      {(incident.senderDomain || call || authLine) && (
        <dl className="facts">
          {incident.senderDomain && <><dt>Sender</dt><dd className="mono">{incident.senderDomain}</dd></>}
          {parsed.replyToDomain && parsed.replyToDomain !== incident.senderDomain && <><dt>Replies to</dt><dd className="mono">{parsed.replyToDomain}</dd></>}
          {authLine && <><dt>Sender checks</dt><dd className={parsed.authFailures.length ? 'mono tone-high' : 'mono'}>{parsed.authFailures.length ? `Failed: ${parsed.authFailures.join(', ')}` : authLine}</dd></>}
          {call && <><dt>Call length</dt><dd className="mono">{duration(call.durationSecs)}</dd></>}
        </dl>
      )}

      <div className="message">{body}</div>

      <h3>Why it was flagged</h3>
      {signals.length ? (
        <ul className="signals">
          {visibleSignals.map(s => <li key={s.id}><span className="weight" aria-label={`weight ${s.weight}`}>{'●'.repeat(Math.min(s.weight, 3))}</span>{s.displayValue}</li>)}
        </ul>
      ) : <p className="quiet">No common scam signals found.</p>}
      {signals.length > 4 && <button type="button" className="link" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${signals.length} signals`}</button>}

      {facts.length > 0 && (
        <div className="tags">
          {facts.map(f => <button key={f.id} type="button" className="tag mono" onClick={() => onSelect({kind: 'indicator', id: f.fingerprint})}>{f.displayValue}</button>)}
        </div>
      )}

      {guidance && (
        <div className="advice">
          <h3>What to tell the customer</h3>
          <p>{guidance.recommendation}</p>
        </div>
      )}

      <div className="actions">
        {campaign && <button type="button" className="primary" disabled={!canAct} onClick={() => onAction({action: 'decoys', campaignId: campaign.id})}>Run decoy session</button>}
        <button type="button" disabled={!canAct || !canProtect} onClick={() => onAction({action: 'protect', incidentId: incident.id})}>
          {incident.status === 'protected' ? 'Guidance shown' : 'Mark guidance shown'}
        </button>
      </div>
      {campaign && <button type="button" className="link" onClick={() => onSelect({kind: 'campaign', id: campaign.id})}>Part of {campaign.label} ({campaign.incidentCount}) →</button>}
    </article>
  );
}

/** Signal labels name one report's domain; across a campaign, say it generically. */
const playbookLabel = (label: string) => label
  .replace(/\s*\([^)]*\)\s*$/, '')
  .replace(/, but the link goes to .*$/, ', but links to another site')
  .replace(/, but was sent from .*$/, ', but is sent from another domain');

function CampaignDetail({campaign, data, onSelect, onAction, canAct}: {campaign: Campaigns} & Omit<Props, 'selection'>) {
  const members = data.incidents.filter(i => i.campaignId === campaign.id).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const channels = [...new Set(members.map(m => CHANNEL_LABEL[m.channel] ?? m.channel))].join(', ');
  const memberIds = new Set(members.map(m => m.id));
  const own = data.indicators.filter(i => memberIds.has(i.incidentId));
  // The playbook: which warning signs recur across this campaign's reports, most common first.
  const playbook = [...own.filter(i => i.kind === 'signal').reduce((map, i) => {
    const entry = map.get(i.fingerprint) ?? {label: playbookLabel(i.displayValue), count: 0, weight: i.weight};
    entry.count += 1;
    return map.set(i.fingerprint, entry);
  }, new Map<string, {label: string; count: number; weight: number}>()).values()]
    .sort((a, b) => b.count - a.count || b.weight - a.weight).slice(0, 5);
  const domains = [...new Set(own.filter(i => i.kind === 'domain').map(i => i.displayValue))];
  const callSecs = data.calls.filter(c => memberIds.has(c.id)).reduce((sum, c) => sum + c.durationSecs, 0);
  return (
    <article className="detail">
      <p className="eyebrow">Campaign</p>
      <h2 className="detail-title">{campaign.label}</h2>
      <dl className="facts">
        <dt>Reports</dt><dd>{campaign.incidentCount}</dd>
        <dt>Channels</dt><dd>{channels || '—'}</dd>
        <dt>First seen</dt><dd>{timeAgo(campaign.firstSeen)}</dd>
        <dt>Last seen</dt><dd>{timeAgo(campaign.lastSeen)}</dd>
        {callSecs > 0 && <><dt>Caller time wasted</dt><dd className="mono">{duration(callSecs)}</dd></>}
      </dl>
      {playbook.length > 0 && (
        <>
          <h3>Playbook</h3>
          <ul className="playbook">
            {playbook.map(p => <li key={p.label}><span>{p.label}</span><span className="mono quiet">{p.count}/{members.length}</span></li>)}
          </ul>
        </>
      )}
      {domains.length > 0 && (
        <>
          <h3>Domains used</h3>
          <div className="tags">{domains.map(d => <span key={d} className="tag mono">{d}</span>)}</div>
        </>
      )}
      <p className="quiet small">Grouped by tactic and impersonated brand. A shared pattern, not proof of a single sender.</p>
      <div className="actions"><button type="button" className="primary" disabled={!canAct} onClick={() => onAction({action: 'decoys', campaignId: campaign.id})}>Run decoy session</button></div>
      <h3>Reports</h3>
      <ul className="rows">{members.map(m => <IncidentRow key={m.id} incident={m} campaign={undefined} onSelect={onSelect} />)}</ul>
    </article>
  );
}

function IndicatorDetail({fingerprint, data, onSelect}: {fingerprint: string; data: ScamData; onSelect: (s: Selection) => void}) {
  const group = sharedIndicators(data.indicators).get(fingerprint);
  const first = data.indicators.find(i => i.fingerprint === fingerprint);
  const ids = new Set(data.indicators.filter(i => i.fingerprint === fingerprint).map(i => i.incidentId));
  const members = data.incidents.filter(i => ids.has(i.id));
  const kind = (group?.kind ?? first?.kind) === 'brand' ? 'Impersonated brand' : 'Domain';
  return (
    <article className="detail">
      <p className="eyebrow">{kind}</p>
      <h2 className="detail-title mono">{group?.label ?? first?.displayValue ?? fingerprint}</h2>
      <p className="quiet small">Seen in {members.length} report{members.length === 1 ? '' : 's'}.</p>
      <ul className="rows">{members.map(m => <IncidentRow key={m.id} incident={m} campaign={data.campaigns.find(c => c.id === m.campaignId)} onSelect={onSelect} />)}</ul>
    </article>
  );
}

function CallInProgress({call}: {call: Calls}) {
  const live = call.status === 'in_progress' || call.status === 'ringing';
  return (
    <article className="detail">
      <p className="eyebrow"><span className="tone-live">Honeypot call</span> · {timeAgo(call.startedAt)}</p>
      <h2 className="detail-title">{live ? 'Call in progress' : call.status === 'processing' ? 'Call ended, summarizing' : 'Call ended'}</h2>
      <p className="quiet">The agent is keeping the caller on the line. The call is filed as a report once ElevenLabs has a summary.</p>
    </article>
  );
}

export function Inspector(props: Props) {
  const {data, selection, onSelect} = props;
  if (selection?.kind === 'incident') {
    const incident = data.incidents.find(i => i.id === selection.id);
    if (incident) return <IncidentDetail key={incident.id} incident={incident} {...props} />;
    const call = data.calls.find(c => c.id === selection.id);
    if (call) return <CallInProgress call={call} />;
  }
  if (selection?.kind === 'campaign') {
    const campaign = data.campaigns.find(c => c.id === selection.id);
    if (campaign) return <CampaignDetail campaign={campaign} {...props} />;
  }
  if (selection?.kind === 'indicator') return <IndicatorDetail fingerprint={selection.id} data={data} onSelect={onSelect} />;

  const recent = [...data.incidents].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)).slice(0, 14);
  return (
    <article className="detail">
      <p className="eyebrow">Latest reports</p>
      {recent.length ? (
        <ul className="rows">{recent.map(i => <IncidentRow key={i.id} incident={i} campaign={data.campaigns.find(c => c.id === i.campaignId)} onSelect={onSelect} />)}</ul>
      ) : <p className="quiet">Nothing yet. Check a message, run a scenario, or call the honeypot.</p>}
    </article>
  );
}
