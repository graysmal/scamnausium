import 'dotenv/config';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {DbConnection} from '../src/module_bindings';
async function connect(token?:string):Promise<DbConnection>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Subscription timed out')),10000);DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('scamnasium').withToken(token).onConnect(c=>c.subscriptionBuilder().onApplied(()=>{clearTimeout(timer);resolve(c);}).subscribeToAllTables()).onConnectError((_c,e)=>{clearTimeout(timer);reject(e);}).build();});}
async function until(check:()=>boolean){for(let n=0;n<100;n++){if(check())return;await sleep(50);}throw Error('Realtime propagation timeout');}
const owner=await connect(process.env.SPACETIMEDB_SERVICE_TOKEN),a=await connect(),b=await connect();
try{
 await owner.reducers.resetDemo({});
 await assert.rejects(a.reducers.reportIncident({eventId:'unauthorized',scenarioId:'delivery'}));
 await owner.reducers.reportIncident({eventId:'smoke-a',scenarioId:'delivery'});
 await owner.reducers.reportIncident({eventId:'smoke-a',scenarioId:'delivery'});
 await until(()=>a.db.incidents.count()===1n&&b.db.incidents.count()===1n);
 await assert.rejects(owner.reducers.protectIncident({incidentId:'smoke-a'}));
 for(const [eventId,scenarioId] of [['smoke-a','delivery'],['smoke-b','variant']]){await owner.reducers.reportIncident({eventId,scenarioId});await owner.reducers.analyzeIncident({incidentId:eventId});await owner.reducers.linkIncident({incidentId:eventId});}
 await until(()=>b.db.campaigns.id.find('parcel-fee')?.incidentCount===2);
 await owner.reducers.startDecoySession({sessionId:'smoke-session',campaignId:'parcel-fee'});
 for(let sequence=0;sequence<12;sequence++)await owner.reducers.recordDecoyEvent({sessionId:'smoke-session',sequence});
 await owner.reducers.recordDecoyEvent({sessionId:'smoke-session',sequence:0});
 await assert.rejects(owner.reducers.recordDecoyEvent({sessionId:'smoke-session',sequence:12}));
 await owner.reducers.protectIncident({incidentId:'smoke-a'});
 await until(()=>a.db.decoyEvents.count()===12n&&b.db.decoyEvents.count()===12n&&b.db.incidents.id.find('smoke-a')?.status==='protected');
 assert.equal([...a.db.decoyEvents.iter()].filter(e=>e.kind==='synthetic_decoy').length,9);
 assert.equal(b.db.decoySessions.id.find('smoke-session')?.state,'completed');
 const c=await connect();assert.equal(c.db.incidents.count(),2n);assert.equal(c.db.decoyEvents.count(),12n);c.disconnect();
 console.log('PASS: two independent subscribers, lifecycle, correlation, duplicate reports/events, unauthorized write rejection, bounded decoys, reconnect snapshot.');
}finally{owner.disconnect();a.disconnect();b.disconnect();}
