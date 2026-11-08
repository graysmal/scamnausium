import { schema, table, t, SenderError, type ReducerCtx } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import {
  scenarios, analyze, transition, sanitizeSummary, parseMessage, externalSources, normalizeCallStatus, isLinkable,
  EXTERNAL_EVENT_ID, CALL_STATUSES, type Scenario, type ExternalSource,
} from './domain';

// Public tables hold sanitized demo data only: no transcripts, phone numbers, email local parts or raw provider ids.
const db = schema({
  operator: table({}, {id: t.u32().primaryKey(), identity: t.identity()}),
  incidents: table({public: true}, {
    id: t.string().primaryKey(), scenarioId: t.string(), channel: t.string(), headline: t.string(), summary: t.string(),
    senderDomain: t.string(), riskLevel: t.string(), confidenceLabel: t.string(), status: t.string(),
    campaignId: t.string().index('btree'), sourceKind: t.string(), createdAt: t.timestamp(),
  }),
  campaigns: table({public: true}, {
    id: t.string().primaryKey(), label: t.string(), impersonatedBrand: t.string(), tactic: t.string(),
    incidentCount: t.u32(), firstSeen: t.timestamp(), lastSeen: t.timestamp(),
  }),
  // kind: signal | domain | brand | sender. fingerprint: normalized value shared across incidents (graph edges).
  indicators: table({public: true}, {
    id: t.string().primaryKey(), incidentId: t.string().index('btree'), kind: t.string(), displayValue: t.string(),
    fingerprint: t.string().index('btree'), weight: t.u32(),
  }),
  interventions: table({public: true}, {id: t.string().primaryKey(), incidentId: t.string().index('btree'), recommendation: t.string(), status: t.string(), timestamp: t.timestamp()}),
  decoySessions: table({public: true}, {id: t.string().primaryKey(), campaignId: t.string(), personaId: t.string(), state: t.string(), eventCount: t.u32(), startedAt: t.timestamp()}),
  decoyEvents: table({public: true}, {id: t.string().primaryKey(), sessionId: t.string().index('btree'), kind: t.string(), synthetic: t.bool(), timestamp: t.timestamp()}),
  // Honeypot calls observed via the ElevenLabs API. id = el-<sha256(conversation_id)>, equal to the incident id once summarized.
  calls: table({public: true}, {
    id: t.string().primaryKey(), status: t.string(), startedAt: t.timestamp(), durationSecs: t.u32(), title: t.string(), updatedAt: t.timestamp(),
  }),
});
export default db;
export const init = db.init(ctx => { ctx.db.operator.insert({id: 0, identity: ctx.sender}); });
type Ctx = ReducerCtx<typeof db.schemaType>;
type IncidentRow = NonNullable<ReturnType<Ctx['db']['incidents']['id']['find']>>;
/** `summary` holds the full sanitized message (headers included), so analysis is reproducible from the row alone. */
const analysisInput = (row: IncidentRow) => row.summary;

function authorize(ctx: Ctx) {
  if (!ctx.db.operator.id.find(0)?.identity.isEqual(ctx.sender)) throw new SenderError('Operator only');
}
function assertCapacity(ctx: Ctx) {
  if (ctx.db.incidents.count() >= 300n) throw new SenderError('Reset the demo before adding more incidents');
}
function insertIncident(ctx: Ctx, id: string, scenarioId: string, channel: string, sourceKind: string, raw: string) {
  const clean = sanitizeSummary(raw);
  if (!clean) throw new SenderError('Empty report');
  const parsed = parseMessage(clean);
  const a = analyze(clean);
  ctx.db.incidents.insert({
    id, scenarioId, channel, headline: parsed.headline, summary: clean, senderDomain: parsed.senderDomain,
    riskLevel: a.riskLevel, confidenceLabel: a.confidence, status: 'reported', campaignId: '', sourceKind, createdAt: ctx.timestamp,
  });
}

export const reportIncident = db.reducer({eventId: t.string(), scenarioId: t.string()}, (ctx, {eventId, scenarioId}) => {
  authorize(ctx);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(eventId) || !Object.prototype.hasOwnProperty.call(scenarios, scenarioId)) throw new SenderError('Invalid scenario or event ID');
  if (ctx.db.incidents.id.find(eventId)) return;
  assertCapacity(ctx);
  const scenario = scenarios[scenarioId as Scenario];
  insertIncident(ctx, eventId, scenarioId, scenario.channel, scenarioId === 'voice' ? 'voice_simulation' : 'manual_demo', scenario.text);
});

// Externally sourced report: verified provider event or operator-pasted message. The gateway passes an opaque hashed
// eventId and pre-sanitized text; it is sanitized again here so raw contact details never reach a public table.
export const reportExternalIncident = db.reducer({eventId: t.string(), source: t.string(), summary: t.string(), channel: t.string()}, (ctx, {eventId, source, summary, channel}) => {
  authorize(ctx);
  if (!EXTERNAL_EVENT_ID.test(eventId) || !Object.prototype.hasOwnProperty.call(externalSources, source)) throw new SenderError('Invalid external event');
  if (ctx.db.incidents.id.find(eventId)) return;
  assertCapacity(ctx);
  const fixed = externalSources[source as ExternalSource];
  const resolvedChannel = fixed !== 'report' ? fixed : (['sms', 'email', 'call', 'imessage'].includes(channel) ? channel : 'sms');
  insertIncident(ctx, eventId, 'external', resolvedChannel, source, summary);
});

export const analyzeIncident = db.reducer({incidentId: t.string()}, (ctx, {incidentId}) => {
  authorize(ctx);
  const row = ctx.db.incidents.id.find(incidentId); if (!row) throw new SenderError('Incident missing');
  const status = transition(row.status, 'analyzed');
  const a = analyze(analysisInput(row));
  let n = 0;
  const put = (kind: string, displayValue: string, fingerprint: string, weight: number) =>
    ctx.db.indicators.insert({id: `${incidentId}-${n++}`, incidentId, kind, displayValue, fingerprint, weight});
  for (const s of a.signals) put('signal', s.label, `signal:${s.id}`, s.weight);
  for (const h of a.hosts.slice(0, 5)) put('domain', h, `domain:${h}`, 0);
  if (a.brandName) put('brand', a.brandName, `brand:${a.brand}`, 0);
  if (a.senderDomain) put('sender', a.senderDomain, `domain:${a.senderDomain}`, 0);
  ctx.db.interventions.insert({id: incidentId, incidentId, recommendation: a.recommendation, status: 'recommended', timestamp: ctx.timestamp});
  ctx.db.incidents.id.update({...row, status, riskLevel: a.riskLevel, confidenceLabel: a.confidence});
});

export const linkIncident = db.reducer({incidentId: t.string()}, (ctx, {incidentId}) => {
  authorize(ctx);
  const row = ctx.db.incidents.id.find(incidentId); if (!row) throw new SenderError('Incident missing');
  const a = analyze(analysisInput(row));
  if (!isLinkable(a.key)) throw new SenderError('Nothing to link: no scam pattern found');
  const status = transition(row.status, 'linked');
  const existing = ctx.db.campaigns.id.find(a.key);
  if (existing) ctx.db.campaigns.id.update({...existing, incidentCount: existing.incidentCount + 1, lastSeen: ctx.timestamp});
  else ctx.db.campaigns.insert({id: a.key, label: a.label, impersonatedBrand: a.brandName, tactic: a.tactic, incidentCount: 1, firstSeen: ctx.timestamp, lastSeen: ctx.timestamp});
  ctx.db.incidents.id.update({...row, status, campaignId: a.key});
});

export const protectIncident = db.reducer({incidentId: t.string()}, (ctx, {incidentId}) => {
  authorize(ctx);
  const row = ctx.db.incidents.id.find(incidentId); if (!row) throw new SenderError('Incident missing');
  ctx.db.incidents.id.update({...row, status: transition(row.status, 'protected')});
  const action = ctx.db.interventions.id.find(incidentId);
  if (action) ctx.db.interventions.id.update({...action, status: 'guidance_shown'});
});

export const upsertCall = db.reducer({id: t.string(), providerStatus: t.string(), startedAtSecs: t.u64(), durationSecs: t.u32(), title: t.string()}, (ctx, {id, providerStatus, startedAtSecs, durationSecs, title}) => {
  authorize(ctx);
  const status = normalizeCallStatus(providerStatus);
  if (!/^el-[a-f0-9]{32}$/.test(id) || !status || !CALL_STATUSES.includes(status)) throw new SenderError('Invalid call');
  const startedAt = new Timestamp(startedAtSecs * 1_000_000n);
  const row = {id, status, startedAt, durationSecs: Math.min(durationSecs, 86_400), title: sanitizeSummary(title, 120), updatedAt: ctx.timestamp};
  const existing = ctx.db.calls.id.find(id);
  if (existing) {
    if (existing.status === row.status && existing.durationSecs === row.durationSecs && existing.title === row.title) return;
    ctx.db.calls.id.update({...row, startedAt: existing.startedAt});
  } else {
    if (ctx.db.calls.count() >= 200n) throw new SenderError('Call log full; reset the demo');
    ctx.db.calls.insert(row);
  }
});

export const startDecoySession = db.reducer({sessionId: t.string(), campaignId: t.string()}, (ctx, {sessionId, campaignId}) => {
  authorize(ctx);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId) || !ctx.db.campaigns.id.find(campaignId)) throw new SenderError('Invalid session/campaign');
  if (ctx.db.decoySessions.id.find(sessionId)) return;
  if (ctx.db.decoySessions.count() >= 20n) throw new SenderError('Session limit reached');
  ctx.db.decoySessions.insert({id: sessionId, campaignId, personaId: 'fictional-alex', state: 'engaging', eventCount: 0, startedAt: ctx.timestamp});
});

export const recordDecoyEvent = db.reducer({sessionId: t.string(), sequence: t.u32()}, (ctx, {sessionId, sequence}) => {
  authorize(ctx);
  const session = ctx.db.decoySessions.id.find(sessionId); if (!session) throw new SenderError('Session missing');
  const id = `${sessionId}-${sequence}`; if (ctx.db.decoyEvents.id.find(id)) return;
  if (session.state !== 'engaging' || sequence !== session.eventCount || sequence >= 12) throw new SenderError('Invalid sequence or completed session');
  ctx.db.decoyEvents.insert({id, sessionId, kind: sequence < 3 ? 'synthetic_baseline' : 'synthetic_decoy', synthetic: true, timestamp: ctx.timestamp});
  ctx.db.decoySessions.id.update({...session, eventCount: sequence + 1, state: sequence === 11 ? 'completed' : 'engaging'});
});

export const resetDemo = db.reducer(ctx => {
  authorize(ctx);
  for (const r of ctx.db.decoyEvents.iter()) ctx.db.decoyEvents.id.delete(r.id);
  for (const r of ctx.db.decoySessions.iter()) ctx.db.decoySessions.id.delete(r.id);
  for (const r of ctx.db.interventions.iter()) ctx.db.interventions.id.delete(r.id);
  for (const r of ctx.db.indicators.iter()) ctx.db.indicators.id.delete(r.id);
  for (const r of ctx.db.incidents.iter()) ctx.db.incidents.id.delete(r.id);
  for (const r of ctx.db.campaigns.iter()) ctx.db.campaigns.id.delete(r.id);
  for (const r of ctx.db.calls.iter()) ctx.db.calls.id.delete(r.id);
});
