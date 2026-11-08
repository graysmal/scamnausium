import {Photon} from '@photon-ai/api';
// This adapter is not wired into ingestion yet. Do not label it as a live integration.
export function createPhotonAdapter(env:NodeJS.ProcessEnv=process.env){
 const key=env.PHOTON_API_KEY,project=env.PHOTON_PROJECT_ID,agent=env.PHOTON_AGENT_HANDLE,sender=env.PHOTON_TEST_SENDER;
 if(!key||!project||!agent||!sender)throw new Error('Photon project, key, agent handle and test sender are required.');
 const client=new Photon({headers:{Authorization:`Bearer ${key}`}});
 const allowed=new Set((env.ALLOWED_TEST_CONTACTS??'').split(',').map(s=>s.trim()).filter(Boolean));
 return {
  async listIncoming(createdSince:string,pageToken?:string){
   const page=await client.projects.listMessages({path:{id:project},query:{platform:'imessage',direction:'received',order:'asc',pageSize:100,createdSince,...(pageToken?{pageToken}:{})}});
   return {...page,items:page.items.filter(m=>m.platform==='imessage'&&m.status==='received'&&m.sentBy.platform==='imessage'&&m.receivedBy?.platform==='imessage'&&m.space.platform==='imessage'&&m.sentBy.kind==='human'&&m.sentBy.handle===sender&&m.receivedBy?.kind==='agent'&&m.receivedBy.handle===agent&&m.space.kind==='direct')};
  },
  async replyToPing(message:Awaited<ReturnType<Photon['projects']['listMessages']>>['items'][number]){
   if(env.ENABLE_LIVE_MESSAGING!=='true'||!allowed.has(sender))throw new Error('Live messaging disabled or sender not allowlisted.');
   if(message.platform!=='imessage'||message.status!=='received'||message.sentBy.platform!=='imessage'||message.receivedBy?.platform!=='imessage'||message.space.platform!=='imessage'||message.sentBy.kind!=='human'||message.sentBy.handle!==sender||message.receivedBy?.kind!=='agent'||message.receivedBy.handle!==agent||message.space.kind!=='direct'||message.content.type!=='text'||message.content.format!=='plain'||message.content.text.trim()!=='ping')throw new Error('Only the configured consenting sender’s plain-text ping can receive a test reply.');
   return client.projects.sendMessage({path:{id:project},headers:{'idempotency-key':`scamnasium-ping:${message.id}`},body:{spaceId:message.space.id,senderId:message.receivedBy.id,parentMessageId:message.id,content:{type:'text',format:'plain',text:'Scamnasium test connection received. This is a consenting synthetic demo; never share real passwords or one-time codes.'}}});
  },
 };
}
