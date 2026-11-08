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
  const body = parseMessage(incident.summary).body || incident.summary;
  return (
    <article className="detail">
      <p className="eyebrow">{CHANNEL_LABEL[incident.channel] ?? incident.channel} · <span className={`tone-${p.tone}`}>{p.label}</span> · {timeAgo(incident.createdAt)}</p>
      <h2 className="detail-title">{incident.headline}</h2>
      <p className={`risk-line risk-${incident.riskLevel}`}>{RISK_LABEL[incident.riskLevel]} <span className="quiet">· {incident.confidenceLabel} confidence</span></p>
      <Steps status={incident.status} />

      {(incident.senderDomain || call) && (
        <dl className="facts">
          {incident.senderDomain && <><dt>Sender</dt><dd className="mono">{incident.senderDomain}</dd></>}
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

function CampaignDetail({campaign, data, onSelect, onAction, canAct}: {campaign: Campaigns} & Omit<Props, 'selection'>) {
  const members = data.incidents.filter(i => i.campaignId === campaign.id).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const channels = [...new Set(members.map(m => CHANNEL_LABEL[m.channel] ?? m.channel))].join(', ');
  return (
    <article className="detail">
      <p className="eyebrow">Campaign</p>
      <h2 className="detail-title">{campaign.label}</h2>
      <dl className="facts">
        <dt>Reports</dt><dd>{campaign.incidentCount}</dd>
        <dt>Channels</dt><dd>{channels || '—'}</dd>
        <dt>First seen</dt><dd>{timeAgo(campaign.firstSeen)}</dd>
        <dt>Last seen</dt><dd>{timeAgo(campaign.lastSeen)}</dd>
      </dl>
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
