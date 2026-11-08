import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DbConnection } from '../../../src/module_bindings/index';
const secret=process.env.OPERATOR_DEMO_SECRET;
const token=process.env.SPACETIMEDB_SERVICE_TOKEN;
if(!secret || secret.length<24 || !token) throw new Error('Run npm run setup:local after publishing the local module.');
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'8kb'}));
let connected=false;
const conn=DbConnection.builder().withUri(process.env.SPACETIMEDB_URI??'ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIMEDB_DATABASE??'scamnasium').withToken(token).onConnect(c=>{c.subscriptionBuilder().onApplied(()=>{connected=true;}).subscribeToAllTables();}).onDisconnect(()=>{connected=false;}).onConnectError(()=>{connected=false;console.error('Database connection failed. Check local server and service token.');}).build();
app.get('/api/status',(_req,res)=>res.json({database:connected?'Connected':'Disconnected',photon:process.env.PHOTON_API_KEY?'Awaiting verification':'Not configured',voice:process.env.ELEVENLABS_AGENT_ID?'Awaiting verification':'Not configured'}));
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
// No provider webhooks are enabled until signature verification and event mapping are implemented.
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{void error;res.status(400).json({error:'Invalid request'});});
app.listen(Number(process.env.PORT??4000),'127.0.0.1',()=>console.log('Gateway listening on http://127.0.0.1:4000 (local demo only)'));
