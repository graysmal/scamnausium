import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DbConnection } from '../../../src/module_bindings/index';
import { createIngestor } from './ingest';
import { parsePostCall, verifyElevenLabsSignature } from './webhooks/elevenlabs';
import { createPhotonAdapter } from './adapters/photon';
import { createPhotonPoller, type PollerStatus } from './workers/photonPoller';
const secret=process.env.OPERATOR_DEMO_SECRET;
const token=process.env.SPACETIMEDB_SERVICE_TOKEN;
if(!secret || secret.length<24 || !token) throw new Error('Run npm run setup:local after publishing the local module.');
const app=express();app.disable('x-powered-by');
let connected=false;
const conn=DbConnection.builder().withUri(process.env.SPACETIMEDB_URI??'ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIMEDB_DATABASE??'scamnasium').withToken(token).onConnect(c=>{c.subscriptionBuilder().onApplied(()=>{connected=true;}).subscribeToAllTables();}).onDisconnect(()=>{connected=false;}).onConnectError(()=>{connected=false;console.error('Database connection failed. Check local server and service token.');}).build();
const ingestor=createIngestor(conn);

// ---- Provider status: only a verified event upgrades a status. Config alone never shows "live". ----
const elevenSecret=process.env.ELEVENLABS_WEBHOOK_SECRET??'';
let lastVerifiedCallAt:string|undefined;
let photonStatus:PollerStatus|undefined;
function voiceStatus(){
 if(lastVerifiedCallAt) return `Verified call event ${lastVerifiedCallAt.slice(11,19)} UTC`;
 return elevenSecret?'Awaiting verification':process.env.ELEVENLABS_AGENT_ID?'Agent set; webhook secret missing':'Not configured';
}
function photonStatusText(){
 if(!photonStatus) return process.env.PHOTON_API_KEY?'Awaiting verification (polling off)':'Not configured';
 if(photonStatus.lastVerifiedMessageAt) return `Verified message ${photonStatus.lastVerifiedMessageAt.slice(11,19)} UTC`;
 if(photonStatus.lastError) return 'Polling error';
 return 'Polling; awaiting first message';
}

// ---- ElevenLabs post-call webhook (HMAC-authenticated; raw body required for signature) ----
let webhookWindowStart=0,webhookCount=0;
app.post('/webhooks/elevenlabs',express.text({type:'*/*',limit:'512kb'}),async(req,res)=>{
 const now=Date.now();if(now-webhookWindowStart>60_000){webhookWindowStart=now;webhookCount=0;}
 if(++webhookCount>30){res.status(429).json({error:'rate limited'});return;}
 if(!elevenSecret){res.status(503).json({error:'ELEVENLABS_WEBHOOK_SECRET not configured'});return;}
 const raw=typeof req.body==='string'?req.body:'';
 const header=req.get('elevenlabs-signature');
 const verified=verifyElevenLabsSignature(raw,header,elevenSecret);
 if(!verified.ok){console.warn(`ElevenLabs webhook rejected: ${verified.reason}`);res.status(401).json({error:'invalid signature'});return;}
 let payload:unknown;
 try{payload=JSON.parse(raw);}catch{res.status(400).json({error:'invalid JSON'});return;}
 const parsed=parsePostCall(payload,process.env.ELEVENLABS_AGENT_ID);
 if(parsed.kind==='ignored'){console.info(`ElevenLabs webhook ignored: ${parsed.reason}`);res.status(200).json({ok:true,ignored:parsed.reason});return;}
 if(!connected){res.status(503).json({error:'database disconnected; retry later'});return;}
 try{
  const outcome=await ingestor.ingest({eventId:parsed.eventId,source:'elevenlabs_call',summary:parsed.summary});
  lastVerifiedCallAt=new Date().toISOString();
  console.info(`ElevenLabs webhook ${outcome}: ${parsed.eventId}`);
  res.status(200).json({ok:true,outcome});
 }catch(error){
  console.error(`ElevenLabs ingest failed: ${error instanceof Error?error.message.slice(0,200):'unknown'}`);
  res.status(503).json({error:'ingest failed; retry later'});
 }
});

app.use(express.json({limit:'8kb'}));
app.get('/api/status',(_req,res)=>res.json({database:connected?'Connected':'Disconnected',photon:photonStatusText(),voice:voiceStatus()}));
app.use('/api', (req,res,next)=>{
 const provided=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')??''), expected=Buffer.from(secret);
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected)){res.status(401).json({error:'Enter your local operator secret to use demo controls.'});return;}
 if(!connected){res.status(503).json({error:'SpacetimeDB is disconnected.'});return;}next();
});
let busy=false,lastAction=0;
app.post('/api/action',async(req,res)=>{
 if(busy||Date.now()-lastAction<500){res.status(429).json({error:'A demo action is already running. Wait a moment.'});return;}
 busy=true;lastAction=Date.now();
 try{
 const {action,scenarioId,incidentId,campaignId}=req.body??{};
 if(action==='inject'){
  if(!['delivery','variant','bank','voice'].includes(scenarioId)) {res.status(400).json({error:'Unknown scenario'});return;}
  const eventId=crypto.randomUUID();
  await conn.reducers.reportIncident({eventId,scenarioId});
  await conn.reducers.analyzeIncident({incidentId:eventId});
  await conn.reducers.linkIncident({incidentId:eventId});
 }else if(action==='protect'&&typeof incidentId==='string') await conn.reducers.protectIncident({incidentId});
 else if(action==='decoys'&&typeof campaignId==='string'){
  const sessionId=crypto.randomUUID();await conn.reducers.startDecoySession({sessionId,campaignId});
  for(let sequence=0;sequence<12;sequence++){await conn.reducers.recordDecoyEvent({sessionId,sequence});await sleep(250);}
 }else if(action==='reset') await conn.reducers.resetDemo({});
 else {res.status(400).json({error:'Invalid action'});return;}
 res.json({ok:true});
 }catch {res.status(409).json({error:'Action rejected. Check incident state, demo limits, and database operator identity.'});}
 finally{busy=false;}
});
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{void error;res.status(400).json({error:'Invalid request'});});
const port=Number(process.env.PORT??4000);
app.listen(port,'127.0.0.1',()=>console.log(`Gateway listening on http://127.0.0.1:${port} (local demo only)`));

// ---- Photon iMessage polling (opt-in, read-only unless ENABLE_LIVE_MESSAGING=true + allowlist) ----
if(process.env.ENABLE_PHOTON_POLLING==='true'){
 try{
  const adapter=createPhotonAdapter();
  const poller=createPhotonPoller(adapter,r=>connected?ingestor.ingest(r):Promise.reject(new Error('database disconnected')));
  photonStatus=poller.status;
  poller.start(Number(process.env.PHOTON_POLL_INTERVAL_MS??5000));
  console.log(`Photon polling enabled (replies ${adapter.liveRepliesEnabled()?'ENABLED for allowlisted sender':'disabled'}).`);
 }catch(error){console.error(`Photon polling not started: ${error instanceof Error?error.message:'unknown'}`);}
}
