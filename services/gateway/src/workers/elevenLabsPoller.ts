import { sanitizeSummary, normalizeCallStatus } from '../../../../spacetimedb/src/domain';
import { callReportText, externalEventId } from '../webhooks/elevenlabs';
import type { ExternalReport, IngestOutcome } from '../ingest';

/**
 * Honeypot call feed without a public webhook URL: poll the ElevenLabs conversations list for our agent.
 * Read-only GETs (free), bounded page size, exponential backoff on errors. Field names are the wire format
 * from @elevenlabs/elevenlabs-js 2.77 serialization (ConversationSummaryResponseModel).
 */
export const MIN_INTERVAL_MS = 8_000;
export const MAX_BACKOFF_MS = 120_000;
const API = 'https://api.elevenlabs.io/v1/convai/conversations';

export interface ConversationSummary {
  conversationId: string;
  status: string;
  startTimeUnixSecs: number;
  callDurationSecs: number;
  transcriptSummary: string;
  title: string;
}

export interface ConversationSource { list(sinceUnixSecs: number): Promise<ConversationSummary[]> }

export class ProviderHttpError extends Error {
  constructor(readonly status: number) { super(`ElevenLabs API responded ${status}`); }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function createConversationSource(apiKey: string, agentId: string, fetchImpl: typeof fetch = fetch): ConversationSource {
  return {
    async list(sinceUnixSecs) {
      const url = new URL(API);
      url.search = new URLSearchParams({agent_id: agentId, page_size: '20', summary_mode: 'include', call_start_after_unix: String(Math.floor(sinceUnixSecs))}).toString();
      const res = await fetchImpl(url, {headers: {'xi-api-key': apiKey, accept: 'application/json'}, signal: AbortSignal.timeout(10_000)});
      if (!res.ok) throw new ProviderHttpError(res.status);
      const body: unknown = await res.json();
      const items = typeof body === 'object' && body !== null && Array.isArray((body as {conversations?: unknown}).conversations) ? (body as {conversations: unknown[]}).conversations : [];
      return items.flatMap(raw => {
        if (typeof raw !== 'object' || raw === null) return [];
        const c = raw as Record<string, unknown>;
        if (str(c.agent_id) !== agentId || !str(c.conversation_id)) return [];
        return [{
          conversationId: str(c.conversation_id), status: str(c.status), startTimeUnixSecs: num(c.start_time_unix_secs),
          callDurationSecs: num(c.call_duration_secs), transcriptSummary: str(c.transcript_summary), title: str(c.call_summary_title),
        }];
      });
    },
  };
}

export interface CallSink {
  upsertCall(call: {id: string; providerStatus: string; startedAtSecs: number; durationSecs: number; title: string}): Promise<void>;
  ingest(report: ExternalReport): Promise<IngestOutcome>;
}

export interface CallPollerStatus { lastPollAt?: string; lastCallAt?: string; activeCalls: number; lastError?: string }

export function createCallPoller(source: ConversationSource, sink: CallSink, lookbackSecs = 3600) {
  const startedFrom = Math.floor(Date.now() / 1000) - lookbackSecs;
  const lastState = new Map<string, string>();
  const ingested = new Set<string>();
  const status: CallPollerStatus = {activeCalls: 0};

  async function pollOnce(): Promise<void> {
    const conversations = await source.list(startedFrom);
    let active = 0;
    for (const c of conversations) {
      const normalized = normalizeCallStatus(c.status);
      if (!normalized) continue;
      if (normalized === 'ringing' || normalized === 'in_progress') active++;
      const id = externalEventId('el', c.conversationId);
      const title = sanitizeSummary(c.title, 120);
      const fingerprint = `${normalized}|${c.callDurationSecs}|${title}`;
      if (lastState.get(id) !== fingerprint) {
        await sink.upsertCall({id, providerStatus: c.status, startedAtSecs: c.startTimeUnixSecs, durationSecs: Math.round(c.callDurationSecs), title});
        lastState.set(id, fingerprint);
        status.lastCallAt = new Date().toISOString();
      }
      if (normalized === 'done' && c.transcriptSummary && !ingested.has(id)) {
        await sink.ingest({eventId: id, source: 'elevenlabs_call', channel: 'call', summary: callReportText(c.title, c.transcriptSummary)});
        ingested.add(id);
      }
    }
    status.activeCalls = active;
  }

  function start(intervalMs: number): () => void {
    const base = Math.max(MIN_INTERVAL_MS, intervalMs);
    let delay = base;
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        await pollOnce();
        status.lastError = undefined;
        delay = base;
      } catch (error) {
        status.lastError = error instanceof Error ? error.message.slice(0, 160) : 'unknown error';
        const retryable = !(error instanceof ProviderHttpError) || error.status === 429 || error.status >= 500;
        delay = retryable ? Math.min(delay * 2, MAX_BACKOFF_MS) : MAX_BACKOFF_MS;
      }
      status.lastPollAt = new Date().toISOString();
      if (!stopped) timer = setTimeout(tick, delay);
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }

  return {pollOnce, start, status};
}
