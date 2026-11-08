import {Photon} from '@photon-ai/api';
// Read path (listIncoming) is used by the opt-in poller (ENABLE_PHOTON_POLLING=true).
// Write path (replies) additionally requires ENABLE_LIVE_MESSAGING=true and an allowlisted sender.
// Neither is "live" until a real message round trip has been verified.

export type PhotonMessage=Awaited<ReturnType<Photon['projects']['listMessages']>>['items'][number];

export type ReceivedImessage=Extract<PhotonMessage,{platform:'imessage';status:'received'}>;
export interface PhotonIdentity{agent:string;sender:string}

/** True only for a received, plain-text, direct iMessage from the configured consenting sender to the configured agent line. */
export function isConsentingDirectText(m:PhotonMessage,{agent,sender}:PhotonIdentity):m is ReceivedImessage{
 return m.platform==='imessage'&&m.status==='received'&&m.sentBy.platform==='imessage'&&m.receivedBy?.platform==='imessage'&&m.space.platform==='imessage'
  &&m.sentBy.kind==='human'&&m.sentBy.handle===sender&&m.receivedBy?.kind==='agent'&&m.receivedBy.handle===agent&&m.space.kind==='direct'
  &&m.content.type==='text'&&m.content.format==='plain';
}

/** Plain text of a message that already passed isConsentingDirectText. */
export function messageText(m:PhotonMessage):string{
 if(m.platform!=='imessage'||m.status!=='received')return '';
 return m.content.type==='text'&&m.content.format==='plain'?m.content.text:'';
}

export const PING_TEXT='Scamnasium test connection received. This is a consenting synthetic demo; never share real passwords or one-time codes.';

export function createPhotonAdapter(env:NodeJS.ProcessEnv=process.env){
 const {PHOTON_API_KEY:key,PHOTON_PROJECT_ID:projectId,PHOTON_AGENT_HANDLE:agentHandle,PHOTON_TEST_SENDER:senderHandle}=env;
 if(!key||!projectId||!agentHandle||!senderHandle)throw new Error('Photon project, key, agent handle and test sender are required.');
 const project:string=projectId,agent:string=agentHandle,sender:string=senderHandle;
 const client=new Photon({headers:{Authorization:`Bearer ${key}`}});
 const allowed=new Set((env.ALLOWED_TEST_CONTACTS??'').split(',').map(s=>s.trim()).filter(Boolean));
 const identity={agent,sender};
 async function reply(message:PhotonMessage,text:string,idempotencyPrefix:string){
  if(env.ENABLE_LIVE_MESSAGING!=='true'||!allowed.has(sender))throw new Error('Live messaging disabled or sender not allowlisted.');
  if(!isConsentingDirectText(message,identity)||message.receivedBy?.platform!=='imessage'||message.receivedBy.kind!=='agent'||message.space.platform!=='imessage'||message.space.kind!=='direct')throw new Error('Only the configured consenting sender’s direct plain-text message can receive a reply.');
  return client.projects.sendMessage({path:{id:project},headers:{'idempotency-key':`${idempotencyPrefix}:${message.id}`},body:{spaceId:message.space.id,senderId:message.receivedBy.id,parentMessageId:message.id,content:{type:'text',format:'plain',text}}});
 }
 return {
  identity,
  liveRepliesEnabled:()=>env.ENABLE_LIVE_MESSAGING==='true'&&allowed.has(sender),
  async listIncoming(createdSince:string,pageToken?:string){
   const page=await client.projects.listMessages({path:{id:project},query:{platform:'imessage',direction:'received',order:'asc',pageSize:100,createdSince,...(pageToken?{pageToken}:{})}});
   return {...page,items:page.items.filter(m=>isConsentingDirectText(m,identity))};
  },
  async replyToPing(message:PhotonMessage){
   if(messageText(message).trim()!=='ping')throw new Error('Only a plain-text ping receives the connection-test reply.');
   return reply(message,PING_TEXT,'scamnasium-ping');
  },
  /** Sends the analysis verdict back to the consenting sender. Text comes from domain.verdictReply. */
  async replyVerdict(message:PhotonMessage,text:string){return reply(message,text.slice(0,600),'scamnasium-verdict');},
 };
}
export type PhotonAdapter=ReturnType<typeof createPhotonAdapter>;
