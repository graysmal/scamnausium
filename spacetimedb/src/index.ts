import { schema, table, t, SenderError, type ReducerCtx } from 'spacetimedb/server';
import { scenarios, analyze, transition, sanitizeSummary, externalSources, type Scenario, type ExternalSource } from './domain';
const db = schema({
 operator:table({}, {id:t.u32().primaryKey(),identity:t.identity()}),
 incidents:table({public:true},{id:t.string().primaryKey(),scenarioId:t.string(),channel:t.string(),summary:t.string(),riskLevel:t.string(),confidenceLabel:t.string(),status:t.string(),campaignId:t.string().index('btree'),sourceKind:t.string(),createdAt:t.timestamp()}),
 campaigns:table({public:true},{id:t.string().primaryKey(),label:t.string(),incidentCount:t.u32(),firstSeen:t.timestamp(),lastSeen:t.timestamp()}),
 indicators:table({public:true},{id:t.string().primaryKey(),incidentId:t.string().index('btree'),displayValue:t.string(),confidenceLabel:t.string()}),
 interventions:table({public:true},{id:t.string().primaryKey(),incidentId:t.string().index('btree'),recommendation:t.string(),status:t.string(),timestamp:t.timestamp()}),
 decoySessions:table({public:true},{id:t.string().primaryKey(),campaignId:t.string(),personaId:t.string(),state:t.string(),eventCount:t.u32(),startedAt:t.timestamp()}),
 decoyEvents:table({public:true},{id:t.string().primaryKey(),sessionId:t.string().index('btree'),kind:t.string(),synthetic:t.bool(),timestamp:t.timestamp()}),
});
export default db;
export const init=db.init(ctx=>{ctx.db.operator.insert({id:0,identity:ctx.sender});});
type Ctx=ReducerCtx<typeof db.schemaType>;
function authorize(ctx:Ctx){if(!ctx.db.operator.id.find(0)?.identity.isEqual(ctx.sender)) throw new SenderError('Operator only');}
export const reportIncident=db.reducer({eventId:t.string(),scenarioId:t.string()},(ctx,{eventId,scenarioId})=>{
 authorize(ctx);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)||!Object.prototype.hasOwnProperty.call(scenarios,scenarioId)) throw new SenderError('Invalid scenario or event ID');
 if(ctx.db.incidents.id.find(eventId)) return;
 if(ctx.db.incidents.count()>=200n) throw new SenderError('Reset the synthetic demo before adding more incidents');
 const scenario=scenarios[scenarioId as Scenario], a=analyze(scenario.text);
 ctx.db.incidents.insert({id:eventId,scenarioId,channel:scenario.channel,summary:scenario.text,riskLevel:'high',confidenceLabel:a.confidence,status:'reported',campaignId:'',sourceKind:scenarioId==='voice'?'voice_simulation':'manual_demo',createdAt:ctx.timestamp});
});
// Externally sourced report (verified provider event). Gateway passes an opaque hashed eventId and an already-sanitized summary;
// the summary is sanitized again here so raw contact details can never land in this public table.
export const reportExternalIncident=db.reducer({eventId:t.string(),source:t.string(),summary:t.string()},(ctx,{eventId,source,summary})=>{
 authorize(ctx);
 if(!/^(el|ph)-[a-f0-9]{32}$/.test(eventId)||!Object.prototype.hasOwnProperty.call(externalSources,source)) throw new SenderError('Invalid external event');
 if(ctx.db.incidents.id.find(eventId)) return;
 const clean=sanitizeSummary(summary);
 if(!clean) throw new SenderError('Empty summary');
 if(ctx.db.incidents.count()>=200n) throw new SenderError('Reset the synthetic demo before adding more incidents');
 const a=analyze(clean);
 ctx.db.incidents.insert({id:eventId,scenarioId:'external',channel:externalSources[source as ExternalSource],summary:clean,riskLevel:a.confidence,confidenceLabel:a.confidence,status:'reported',campaignId:'',sourceKind:source,createdAt:ctx.timestamp});
});
export const analyzeIncident=db.reducer({incidentId:t.string()},(ctx,{incidentId})=>{
 authorize(ctx); const row=ctx.db.incidents.id.find(incidentId); if(!row) throw new SenderError('Incident missing');
 const a=analyze(row.summary); const status=transition(row.status,'analyzed');
 a.evidence.forEach((displayValue,i)=>ctx.db.indicators.insert({id:`${incidentId}-${i}`,incidentId,displayValue,confidenceLabel:a.confidence}));
 ctx.db.interventions.insert({id:incidentId,incidentId,recommendation:a.recommendation,status:'recommended',timestamp:ctx.timestamp});
 ctx.db.incidents.id.update({...row,status});
});
export const linkIncident=db.reducer({incidentId:t.string()},(ctx,{incidentId})=>{
 authorize(ctx);const row=ctx.db.incidents.id.find(incidentId);if(!row) throw new SenderError('Incident missing');
 const status=transition(row.status,'linked'),a=analyze(row.summary),existing=ctx.db.campaigns.id.find(a.key);
 if(existing) ctx.db.campaigns.id.update({...existing,incidentCount:existing.incidentCount+1,lastSeen:ctx.timestamp});
 else ctx.db.campaigns.insert({id:a.key,label:a.label,incidentCount:1,firstSeen:ctx.timestamp,lastSeen:ctx.timestamp});
 ctx.db.incidents.id.update({...row,status,campaignId:a.key});
});
export const protectIncident=db.reducer({incidentId:t.string()},(ctx,{incidentId})=>{
 authorize(ctx);const row=ctx.db.incidents.id.find(incidentId);if(!row) throw new SenderError('Incident missing');
 ctx.db.incidents.id.update({...row,status:transition(row.status,'protected')});
 const action=ctx.db.interventions.id.find(incidentId);if(action) ctx.db.interventions.id.update({...action,status:'guidance_shown'});
});
export const startDecoySession=db.reducer({sessionId:t.string(),campaignId:t.string()},(ctx,{sessionId,campaignId})=>{
 authorize(ctx);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)||!ctx.db.campaigns.id.find(campaignId)) throw new SenderError('Invalid session/campaign');
 if(ctx.db.decoySessions.id.find(sessionId)) return;
 if(ctx.db.decoySessions.count()>=20n) throw new SenderError('Session limit reached');
 ctx.db.decoySessions.insert({id:sessionId,campaignId,personaId:'fictional-alex',state:'engaging',eventCount:0,startedAt:ctx.timestamp});
});
export const recordDecoyEvent=db.reducer({sessionId:t.string(),sequence:t.u32()},(ctx,{sessionId,sequence})=>{
 authorize(ctx);const session=ctx.db.decoySessions.id.find(sessionId);if(!session) throw new SenderError('Session missing');
 const id=`${sessionId}-${sequence}`;if(ctx.db.decoyEvents.id.find(id)) return;
 if(session.state!=='engaging'||sequence!==session.eventCount||sequence>=12) throw new SenderError('Invalid sequence or completed session');
 ctx.db.decoyEvents.insert({id,sessionId,kind:sequence<3?'synthetic_baseline':'synthetic_decoy',synthetic:true,timestamp:ctx.timestamp});
 ctx.db.decoySessions.id.update({...session,eventCount:sequence+1,state:sequence===11?'completed':'engaging'});
});
export const resetDemo=db.reducer(ctx=>{
 authorize(ctx);
 for(const r of ctx.db.decoyEvents.iter()) ctx.db.decoyEvents.id.delete(r.id);
 for(const r of ctx.db.decoySessions.iter()) ctx.db.decoySessions.id.delete(r.id);
 for(const r of ctx.db.interventions.iter()) ctx.db.interventions.id.delete(r.id);
 for(const r of ctx.db.indicators.iter()) ctx.db.indicators.id.delete(r.id);
 for(const r of ctx.db.incidents.iter()) ctx.db.incidents.id.delete(r.id);
 for(const r of ctx.db.campaigns.iter()) ctx.db.campaigns.id.delete(r.id);
});
