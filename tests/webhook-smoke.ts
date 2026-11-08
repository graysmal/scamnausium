// End-to-end: signed ElevenLabs post-call fixture -> gateway -> SpacetimeDB -> subscriber.
// Requires local SpacetimeDB + gateway running with ELEVENLABS_WEBHOOK_SECRET and ELEVENLABS_AGENT_ID set.
// Uses a synthetic payload only; sends nothing to any provider. Resets the local demo database first.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DbConnection } from '../src/module_bindings';
import { externalEventId } from '../services/gateway/src/webhooks/elevenlabs';

const base = `http://127.0.0.1:${process.env.PORT ?? 4000}`;
const secret = process.env.ELEVENLABS_WEBHOOK_SECRET, agent = process.env.ELEVENLABS_AGENT_ID;
if (!secret || !agent) throw new Error('Set ELEVENLABS_WEBHOOK_SECRET and ELEVENLABS_AGENT_ID (test values) for this smoke test.');

const conversationId = `smoke-${randomUUID()}`;
const body = JSON.stringify({
  type: 'post_call_transcription', event_timestamp: Math.floor(Date.now() / 1000),
  data: {
    agent_id: agent, conversation_id: conversationId, status: 'done',
    transcript: [{ role: 'user', message: 'RAW-TRANSCRIPT-MUST-NOT-APPEAR call me on 415 555 0100' }],
    metadata: { call_duration_secs: 42 },
    analysis: { transcript_summary: 'Role-play caller claimed to be account support and urgently asked for a one-time password. Gave callback 415-555-0100.', call_successful: 'success' },
  },
});
const sign = (b: string, key = secret) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v0=${createHmac('sha256', key).update(`${t}.${b}`).digest('hex')}`; };
const post = (b: string, sig?: string) => fetch(`${base}/webhooks/elevenlabs`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sig ? { 'ElevenLabs-Signature': sig } : {}) }, body: b });

const conn = await new Promise<DbConnection>((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Subscription timed out')), 10000);
  DbConnection.builder().withUri(process.env.SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIMEDB_DATABASE ?? 'scamnasium').withToken(process.env.SPACETIMEDB_SERVICE_TOKEN)
    .onConnect(c => c.subscriptionBuilder().onApplied(() => { clearTimeout(timer); resolve(c); }).subscribeToAllTables())
    .onConnectError((_c, e) => { clearTimeout(timer); reject(e); }).build();
});
try {
  await conn.reducers.resetDemo({});
  const id = externalEventId('el', conversationId);

  assert.equal((await post(body)).status, 401, 'missing signature must be rejected');
  assert.equal((await post(body, sign(body, 'wrong-secret'))).status, 401, 'wrong secret must be rejected');
  assert.equal((await post(body.replace('42', '43'), sign(body))).status, 401, 'tampered body must be rejected');
  assert.equal(conn.db.incidents.count(), 0n);

  const first = await post(body, sign(body));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).outcome, 'created');
  for (let n = 0; n < 100 && conn.db.incidents.id.find(id)?.status !== 'linked'; n++) await sleep(50);
  const row = conn.db.incidents.id.find(id);
  assert.ok(row, 'incident row created');
  assert.equal(row.sourceKind, 'elevenlabs_call');
  assert.equal(row.channel, 'call');
  assert.equal(row.status, 'linked');
  assert.equal(row.campaignId, 'code_theft:unbranded');
  assert.ok(!row.summary.includes('RAW-TRANSCRIPT'), 'raw transcript must never be stored');
  assert.ok(!row.summary.includes('555'), 'phone numbers must be redacted');
  assert.ok(!row.id.includes(conversationId), 'provider ids must not be stored raw');

  const replay = await post(body, sign(body));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).outcome, 'duplicate');
  assert.equal(conn.db.incidents.count(), 1n);
  assert.equal(conn.db.campaigns.id.find('code_theft:unbranded')?.incidentCount, 1, 'replay must not double count');

  const other = JSON.stringify({ ...JSON.parse(body), data: { ...JSON.parse(body).data, agent_id: 'someone-else' } });
  assert.equal((await (await post(other, sign(other))).json()).ignored !== undefined, true, 'other agents are ignored');

  const status = await fetch(`${base}/api/status`).then(r => r.json());
  assert.equal(status.voice.state, 'verified');
  console.log('PASS: signature rejection (missing/wrong/tampered), verified call -> linked incident, transcript+phone redaction, hashed id, replay dedupe, agent filter, status upgrade.');
} finally { conn.disconnect(); }
