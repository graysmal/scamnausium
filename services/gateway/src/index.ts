import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DbConnection } from '../../../src/module_bindings/index';
import { MAX_REPORT_LENGTH, parseMessage, sanitizeSummary } from '../../../spacetimedb/src/domain';
import { compactEmail } from '../../../spacetimedb/src/email';
import { createIngestor, type ExternalReport } from './ingest';
import { parsePostCall, verifyElevenLabsSignature } from './webhooks/elevenlabs';
import { createPhotonAdapter } from './adapters/photon';
import { createPhotonPoller, type PollerStatus } from './workers/photonPoller';
import { createCallPoller, createConversationSource, type CallPollerStatus } from './workers/elevenLabsPoller';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const env = process.env;
const operatorSecret = env.OPERATOR_DEMO_SECRET ?? '';
const serviceToken = env.SPACETIMEDB_SERVICE_TOKEN ?? '';
if (operatorSecret.length < 24 || !serviceToken) throw new Error('Run npm run setup:local after publishing the local module.');
const port = Number(env.PORT ?? 4000);
const elevenWebhookSecret = env.ELEVENLABS_WEBHOOK_SECRET ?? '';
const elevenAgentId = env.ELEVENLABS_AGENT_ID ?? '';
/** Public honeypot number shown in the UI (it is meant to be called). Display only. */
const honeypotNumber = (env.HONEYPOT_NUMBER ?? '').slice(0, 32);

// ---------------------------------------------------------------------------
// Database connection (gateway is the module's operator identity)
// ---------------------------------------------------------------------------
let connected = false;
let reconnectDelay = 1000;
let reconnectTimer: NodeJS.Timeout | undefined;
function connect(): DbConnection {
  return DbConnection.builder()
    .withUri(env.SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000')
    .withDatabaseName(env.SPACETIMEDB_DATABASE ?? 'scamnasium')
    .withToken(serviceToken)
    .onConnect(c => {
      c.subscriptionBuilder().onApplied(() => { connected = true; reconnectDelay = 1000; console.log('Database connected.'); }).subscribeToAllTables();
    })
    .onDisconnect(() => { connected = false; scheduleReconnect('disconnected'); })
    .onConnectError(() => { connected = false; scheduleReconnect('connection failed (check the server and SPACETIMEDB_SERVICE_TOKEN)'); })
    .build();
}
/** Reconnects with exponential backoff (1s → 30s) so a database restart doesn't require restarting the gateway. */
function scheduleReconnect(reason: string) {
  if (reconnectTimer) return;
  console.error(`Database ${reason}; retrying in ${reconnectDelay / 1000}s.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    conn = connect();
  }, reconnectDelay);
}
let conn = connect();
// Delegate through getters so the ingestor always uses the current connection after a reconnect.
const ingestor = createIngestor({get reducers() { return conn.reducers; }, get db() { return conn.db; }});
const ingest = (r: ExternalReport) => connected ? ingestor.ingest(r) : Promise.reject(new Error('database disconnected'));
const upsertCall = async (c: {id: string; providerStatus: string; startedAtSecs: number; durationSecs: number; title: string}) => {
  if (!connected) throw new Error('database disconnected');
  await conn.reducers.upsertCall({...c, startedAtSecs: BigInt(Math.max(0, Math.floor(c.startedAtSecs)))});
};
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'unknown error').slice(0, 200);

// ---------------------------------------------------------------------------
// Provider status. Only verified provider activity upgrades a status; config alone never reads as live.
// ---------------------------------------------------------------------------
let lastWebhookCallAt: string | undefined;
let callPoller: CallPollerStatus | undefined;
let photonPoller: PollerStatus | undefined;
const hhmm = (iso: string) => iso.slice(11, 16) + ' UTC';

function voiceStatus(): {state: string; detail: string} {
  if (callPoller?.activeCalls) return {state: 'active', detail: `${callPoller.activeCalls} call${callPoller.activeCalls > 1 ? 's' : ''} in progress`};
  const lastCall = [callPoller?.lastCallAt, lastWebhookCallAt].filter(Boolean).sort().at(-1);
  if (lastCall) return {state: 'verified', detail: `Last call ${hhmm(lastCall)}`};
  if (callPoller?.lastError) return {state: 'error', detail: callPoller.lastError};
  if (callPoller) return {state: 'waiting', detail: 'Watching for calls'};
  if (elevenWebhookSecret) return {state: 'waiting', detail: 'Webhook ready, no call yet'};
  return {state: 'off', detail: elevenAgentId ? 'Polling off' : 'Not configured'};
}
function messagingStatus(): {state: string; detail: string} {
  if (!photonPoller) return {state: 'off', detail: env.PHOTON_API_KEY ? 'Polling off' : 'Not configured'};
  if (photonPoller.lastVerifiedMessageAt) return {state: 'verified', detail: `Last message ${hhmm(photonPoller.lastVerifiedMessageAt)}`};
  if (photonPoller.lastError) return {state: 'error', detail: photonPoller.lastError};
  return {state: 'waiting', detail: 'Watching for messages'};
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');

/** Fixed-window limiter keyed by route; enough for a single-operator local demo. */
function limit(max: number, windowMs: number) {
  let start = 0, count = 0;
  return (_req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (now - start > windowMs) { start = now; count = 0; }
    if (++count > max) { res.status(429).json({error: 'Too many requests. Wait a moment.'}); return; }
    next();
  };
}

// ElevenLabs post-call webhook. Mounted before express.json: the HMAC covers the raw body. HMAC is the auth.
app.post('/webhooks/elevenlabs', limit(30, 60_000), express.text({type: '*/*', limit: '512kb'}), async (req, res) => {
  if (!elevenWebhookSecret) { res.status(503).json({error: 'ELEVENLABS_WEBHOOK_SECRET not configured'}); return; }
  const raw = typeof req.body === 'string' ? req.body : '';
  const verified = verifyElevenLabsSignature(raw, req.get('elevenlabs-signature'), elevenWebhookSecret);
  if (!verified.ok) { console.warn(`ElevenLabs webhook rejected: ${verified.reason}`); res.status(401).json({error: 'invalid signature'}); return; }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { res.status(400).json({error: 'invalid JSON'}); return; }
  const parsed = parsePostCall(payload, elevenAgentId || undefined);
  if (parsed.kind === 'ignored') { console.info(`ElevenLabs webhook ignored: ${parsed.reason}`); res.json({ok: true, ignored: parsed.reason}); return; }
  try {
    await upsertCall({id: parsed.eventId, providerStatus: 'done', ...parsed.call});
    const outcome = await ingest({eventId: parsed.eventId, source: 'elevenlabs_call', channel: 'call', summary: parsed.summary});
    lastWebhookCallAt = new Date().toISOString();
    console.info(`ElevenLabs webhook ${outcome}: ${parsed.eventId}`);
    res.json({ok: true, outcome});
  } catch (error) {
    console.error(`ElevenLabs ingest failed: ${errorText(error)}`);
    res.status(503).json({error: 'ingest failed; retry later'}); // 5xx -> ElevenLabs retries (if enabled)
  }
});

// Raw emails (.eml, "Show original") carry long headers and HTML parts; only the report route accepts them.
const smallJson = express.json({limit: '16kb'});
const reportJson = express.json({limit: '512kb'});
app.use((req, res, next) => (req.path === '/api/report' ? reportJson : smallJson)(req, res, next));

app.get('/api/status', (_req, res) => {
  res.json({database: connected ? 'Connected' : 'Disconnected', honeypotNumber, voice: voiceStatus(), messaging: messagingStatus()});
});

// Everything below requires the operator secret.
app.use('/api', (req, res, next) => {
  const provided = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(operatorSecret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) { res.status(401).json({error: 'Enter the operator key to use controls.'}); return; }
  if (!connected) { res.status(503).json({error: 'SpacetimeDB is disconnected.'}); return; }
  next();
});

// Operator pastes a suspicious text or email; it is analyzed and linked like any other report.
app.post('/api/report', limit(20, 60_000), async (req, res) => {
  const {text, channel} = (req.body ?? {}) as {text?: unknown; channel?: unknown};
  if (typeof text !== 'string' || !text.trim()) { res.status(400).json({error: 'Paste the message text first.'}); return; }
  const compact = compactEmail(text);
  if (compact.length > MAX_REPORT_LENGTH && compact === text) { res.status(400).json({error: `Keep it under ${MAX_REPORT_LENGTH} characters.`}); return; }
  const clean = sanitizeSummary(compact, MAX_REPORT_LENGTH);
  const resolved = channel === 'sms' || channel === 'email' || channel === 'imessage' ? channel : parseMessage(clean).looksLikeEmail ? 'email' : 'sms';
  const eventId = `rp-${createHash('sha256').update(clean.toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 32)}`;
  try {
    const outcome = await ingest({eventId, source: 'operator_report', channel: resolved, summary: clean});
    res.json({ok: true, incidentId: eventId, outcome});
  } catch (error) {
    console.error(`Report ingest failed: ${errorText(error)}`);
    res.status(409).json({error: 'Could not record the report. Check demo limits or reset.'});
  }
});

let actionBusy = false;
app.post('/api/action', limit(60, 60_000), async (req, res) => {
  if (actionBusy) { res.status(429).json({error: 'Another action is still running.'}); return; }
  const {action, scenarioId, incidentId, campaignId} = (req.body ?? {}) as Record<string, unknown>;
  actionBusy = true;
  try {
    if (action === 'inject' && typeof scenarioId === 'string' && ['delivery', 'variant', 'bank', 'voice'].includes(scenarioId)) {
      const eventId = crypto.randomUUID();
      await conn.reducers.reportIncident({eventId, scenarioId});
      await conn.reducers.analyzeIncident({incidentId: eventId});
      await conn.reducers.linkIncident({incidentId: eventId});
      res.json({ok: true, incidentId: eventId});
    } else if (action === 'protect' && typeof incidentId === 'string') {
      await conn.reducers.protectIncident({incidentId});
      res.json({ok: true});
    } else if (action === 'dismiss' && typeof incidentId === 'string') {
      await conn.reducers.dismissIncident({incidentId});
      res.json({ok: true});
    } else if (action === 'decoys' && typeof campaignId === 'string') {
      const sessionId = crypto.randomUUID();
      await conn.reducers.startDecoySession({sessionId, campaignId});
      for (let sequence = 0; sequence < 12; sequence++) { await conn.reducers.recordDecoyEvent({sessionId, sequence}); await sleep(250); }
      res.json({ok: true});
    } else if (action === 'reset') {
      await conn.reducers.resetDemo({});
      res.json({ok: true});
    } else {
      res.status(400).json({error: 'Invalid action'});
    }
  } catch (error) {
    console.error(`Action ${String(action)} rejected: ${errorText(error)}`);
    res.status(409).json({error: 'Action rejected. Check the incident state and demo limits.'});
  } finally {
    actionBusy = false;
  }
});

app.use((_req, res) => res.status(404).json({error: 'Not found'}));
app.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => res.status(400).json({error: 'Invalid request'}));
app.listen(port, '127.0.0.1', () => console.log(`Gateway listening on http://127.0.0.1:${port} (local only)`));

// ---------------------------------------------------------------------------
// Background workers (opt-in)
// ---------------------------------------------------------------------------
if (env.ENABLE_ELEVENLABS_POLLING === 'true') {
  if (!env.ELEVENLABS_API_KEY || !elevenAgentId) console.error('ElevenLabs polling not started: set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.');
  else {
    const poller = createCallPoller(createConversationSource(env.ELEVENLABS_API_KEY, elevenAgentId), {upsertCall, ingest}, Number(env.ELEVENLABS_LOOKBACK_SECS ?? 3600));
    callPoller = poller.status;
    poller.start(Number(env.ELEVENLABS_POLL_INTERVAL_MS ?? 10_000));
    console.log('ElevenLabs call polling enabled (read-only).');
  }
}

if (env.ENABLE_PHOTON_POLLING === 'true') {
  try {
    const adapter = createPhotonAdapter();
    const poller = createPhotonPoller(adapter, ingest);
    photonPoller = poller.status;
    poller.start(Number(env.PHOTON_POLL_INTERVAL_MS ?? 5000));
    console.log(`Photon polling enabled (replies ${adapter.liveRepliesEnabled() ? 'ENABLED for allowlisted sender' : 'disabled'}).`);
  } catch (error) {
    console.error(`Photon polling not started: ${errorText(error)}`);
  }
}
