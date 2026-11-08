import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { analyze, isLinkable, sanitizeSummary, transition } from '../spacetimedb/src/domain';
import { externalEventId, parsePostCall, verifyElevenLabsSignature } from '../services/gateway/src/webhooks/elevenlabs';
import { createIngestor, type IngestConnection } from '../services/gateway/src/ingest';
import { createPhotonPoller, type PollerAdapter } from '../services/gateway/src/workers/photonPoller';
import type { ReceivedImessage } from '../services/gateway/src/adapters/photon';

const SECRET = 'wsec_test_only_not_a_real_secret';
const sign = (body: string, t: number, secret = SECRET) => `t=${t},v0=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const now = 1_800_000_000;

// ---------- domain ----------
test('sanitizeSummary redacts contact details and caps length', () => {
  const out = sanitizeSummary('Call me at +1 (415) 555-0100 or jane.doe@example.com, card 4111111111111111\u0007 ok');
  assert.ok(!out.includes('555'), out);
  assert.ok(!out.includes('jane.doe'), out);
  assert.ok(out.includes('•••@example.com'), out);
  assert.ok(!out.includes('4111'), out);
  assert.ok(!/[\u0000-\u001f]/.test(out));
  assert.equal(sanitizeSummary('x'.repeat(1000)).length, 600);
});

test('analysis no longer labels benign text as a bank lure', () => {
  const a = analyze('Hey, are we still on for lunch?');
  assert.equal(a.key, 'unclassified');
  assert.equal(a.confidence, 'low');
  assert.equal(isLinkable(a.key), false);
  assert.equal(analyze('Caller said he was from support and urgently asked for my one-time code').key, 'code_theft:unbranded');
});

test('state machine allows guidance on an analyzed-but-unlinked incident', () => {
  assert.equal(transition('analyzed', 'protected'), 'protected');
  assert.throws(() => transition('reported', 'protected'));
});

// ---------- ElevenLabs signature ----------
test('ElevenLabs signature: valid passes; tampered, wrong secret, stale, future and malformed fail', () => {
  const body = '{"type":"post_call_transcription"}';
  assert.deepEqual(verifyElevenLabsSignature(body, sign(body, now), SECRET, now), { ok: true });
  assert.equal(verifyElevenLabsSignature(body + ' ', sign(body, now), SECRET, now).ok, false);
  assert.equal(verifyElevenLabsSignature(body, sign(body, now, 'other'), SECRET, now).ok, false);
  assert.equal(verifyElevenLabsSignature(body, sign(body, now - 31 * 60), SECRET, now).ok, false);
  assert.equal(verifyElevenLabsSignature(body, sign(body, now + 10 * 60), SECRET, now).ok, false);
  assert.equal(verifyElevenLabsSignature(body, undefined, SECRET, now).ok, false);
  assert.equal(verifyElevenLabsSignature(body, 't=abc,v0=zz', SECRET, now).ok, false);
});

// ---------- ElevenLabs payload ----------
const callPayload = (over: Record<string, unknown> = {}) => ({
  type: 'post_call_transcription', event_timestamp: now,
  data: {
    agent_id: 'agent_test', conversation_id: 'conv_123', status: 'done',
    transcript: [{ role: 'user', message: 'SECRET-TRANSCRIPT-LINE my number is 415 555 0100' }],
    analysis: { transcript_summary: 'Caller claimed to be bank support and urgently requested a one-time password. Callback 415-555-0100.', call_successful: 'success' },
    ...over,
  },
});

test('parsePostCall uses only the sanitized summary and a hashed id', () => {
  const r = parsePostCall(callPayload(), 'agent_test');
  assert.equal(r.kind, 'incident');
  if (r.kind !== 'incident') return;
  assert.equal(r.eventId, externalEventId('el', 'conv_123'));
  assert.match(r.eventId, /^el-[a-f0-9]{32}$/);
  assert.ok(!r.eventId.includes('conv_123'));
  assert.ok(!r.summary.includes('SECRET-TRANSCRIPT-LINE'));
  assert.ok(!r.summary.includes('555'));
  assert.equal(analyze(r.summary).key, 'code_theft:unbranded');
});

test('parsePostCall ignores other agents, other event types and empty summaries', () => {
  assert.equal(parsePostCall(callPayload(), 'agent_other').kind, 'ignored');
  assert.equal(parsePostCall({ ...callPayload(), type: 'post_call_audio' }, 'agent_test').kind, 'ignored');
  assert.equal(parsePostCall(callPayload({ analysis: {} }), 'agent_test').kind, 'ignored');
  assert.equal(parsePostCall('nope', 'agent_test').kind, 'ignored');
});

// ---------- ingestor ----------
function fakeConn(failAnalyzeOnce = false) {
  const rows = new Map<string, { status: string }>();
  const calls: string[] = [];
  let failNext = failAnalyzeOnce;
  const conn: IngestConnection = {
    db: { incidents: { id: { find: (id: string) => rows.get(id) } } },
    reducers: {
      reportExternalIncident: async ({ eventId }) => { calls.push('report'); rows.set(eventId, { status: 'reported' }); },
      analyzeIncident: async ({ incidentId }) => { calls.push('analyze'); if (failNext) { failNext = false; throw new Error('boom'); } rows.set(incidentId, { status: 'analyzed' }); },
      linkIncident: async ({ incidentId }) => { calls.push('link'); rows.set(incidentId, { status: 'linked' }); },
    } as IngestConnection['reducers'],
  };
  return { conn, rows, calls };
}
const otpReport = { eventId: externalEventId('el', 'c1'), source: 'elevenlabs_call' as const, channel: 'call' as const, summary: 'Caller urgently requested a one-time password' };

test('ingestor creates, links, and drops replays', async () => {
  const { conn, calls } = fakeConn();
  const ing = createIngestor(conn);
  assert.equal(await ing.ingest(otpReport), 'created');
  assert.equal(await ing.ingest(otpReport), 'duplicate');
  assert.deepEqual(calls, ['report', 'analyze', 'link']);
});

test('ingestor resumes a partially processed event on retry', async () => {
  const { conn, calls, rows } = fakeConn(true);
  const ing = createIngestor(conn);
  await assert.rejects(ing.ingest(otpReport));
  assert.equal(rows.get(otpReport.eventId)?.status, 'reported');
  assert.equal(await ing.ingest(otpReport), 'resumed');
  assert.equal(rows.get(otpReport.eventId)?.status, 'linked');
  assert.deepEqual(calls, ['report', 'analyze', 'analyze', 'link']);
});

test('ingestor does not link unclassified reports', async () => {
  const { conn, calls } = fakeConn();
  await createIngestor(conn).ingest({ ...otpReport, eventId: externalEventId('ph', 'm9'), summary: 'iMessage report: lunch at noon?' });
  assert.deepEqual(calls, ['report', 'analyze']);
});

// ---------- Photon poller ----------
const msg = (id: string, text: string, createdAt: string) => ({ id, createdAt, platform: 'imessage', status: 'received', content: { type: 'text', format: 'plain', text } }) as unknown as ReceivedImessage;

function fakeAdapter(pages: ReceivedImessage[][], live = false) {
  const replies: string[] = [];
  const cursors: string[] = [];
  const adapter: PollerAdapter = {
    listIncoming: async (since) => { cursors.push(since); return { items: pages.shift() ?? [] }; },
    replyToPing: async (m) => { replies.push(`ping:${m.id}`); },
    replyAck: async (m) => { replies.push(`ack:${m.id}`); },
    liveRepliesEnabled: () => live,
  };
  return { adapter, replies, cursors };
}

test('poller ingests reports, skips ping, dedupes, advances cursor, never replies when disabled', async () => {
  const m1 = msg('m1', 'Got a text: your parcel fee is due today https://parcel-check.example.com/pay', '2026-11-08T10:00:01Z');
  const m2 = msg('m2', 'ping', '2026-11-08T10:00:02Z');
  const { adapter, replies, cursors } = fakeAdapter([[m1, m2], [m1]]);
  const ingested: string[] = [];
  const poller = createPhotonPoller(adapter, async r => { ingested.push(r.eventId); assert.equal(r.source, 'photon_imessage'); return 'created'; }, '2026-11-08T10:00:00Z');
  assert.equal(await poller.pollOnce(), 2);
  assert.equal(await poller.pollOnce(), 0);
  assert.deepEqual(ingested, [externalEventId('ph', 'm1')]);
  assert.deepEqual(replies, []);
  assert.deepEqual(cursors, ['2026-11-08T10:00:00Z', '2026-11-08T10:00:02Z']);
  assert.ok(poller.status.lastVerifiedMessageAt);
});

test('poller replies once per new report only when live replies are enabled', async () => {
  const { adapter, replies } = fakeAdapter([[msg('m1', 'bank says verify password urgently', 't1'), msg('m2', 'ping', 't2')]], true);
  const poller = createPhotonPoller(adapter, async () => 'created', 't0');
  await poller.pollOnce();
  assert.deepEqual(replies, ['ack:m1', 'ping:m2']);
});

test('poller records errors without throwing and retries the message next poll', async () => {
  const m1 = msg('m1', 'bank password urgently', 't1');
  const { adapter } = fakeAdapter([[m1], [m1]]);
  let fail = true;
  const poller = createPhotonPoller(adapter, async () => { if (fail) { fail = false; throw new Error('db down'); } return 'created'; }, 't0');
  assert.equal(await poller.pollOnce(), 0);
  assert.equal(poller.status.lastError, 'db down');
  assert.equal(await poller.pollOnce(), 1);
  assert.equal(poller.status.lastError, undefined);
});

// ---------- ElevenLabs call poller ----------
import { createCallPoller, type ConversationSummary } from '../services/gateway/src/workers/elevenLabsPoller';
test('call poller: live call upserted once per change, summarized call ingested once', async () => {
  const live: ConversationSummary = { conversationId: 'conv-1', status: 'in-progress', startTimeUnixSecs: now, callDurationSecs: 0, transcriptSummary: '', title: '' };
  const done: ConversationSummary = { ...live, status: 'done', callDurationSecs: 95, title: 'Fake Amazon refund', transcriptSummary: 'Caller urgently asked for the one-time code. Callback 415 555 0100.' };
  const pages = [[live], [live], [done], [done]];
  const upserts: string[] = [], reports: string[] = [];
  const poller = createCallPoller({ list: async () => pages.shift() ?? [] }, {
    upsertCall: async c => { upserts.push(c.providerStatus); },
    ingest: async r => { reports.push(r.summary); assert.equal(r.channel, 'call'); return 'created'; },
  });
  await poller.pollOnce(); assert.equal(poller.status.activeCalls, 1);
  await poller.pollOnce(); await poller.pollOnce(); await poller.pollOnce();
  assert.deepEqual(upserts, ['in-progress', 'done']);
  assert.equal(reports.length, 1);
  assert.match(reports[0], /^Fake Amazon refund\. /);
  assert.ok(!reports[0].includes('555'));
  assert.equal(poller.status.activeCalls, 0);
});
