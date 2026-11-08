import { sanitizeSummary } from '../../../../spacetimedb/src/domain';
import { externalEventId } from '../webhooks/elevenlabs';
import { messageText, type PhotonMessage, type ReceivedImessage } from '../adapters/photon';
import type { ExternalReport, IngestOutcome } from '../ingest';

export const MIN_POLL_INTERVAL_MS = 5_000;
export const MAX_MESSAGES_PER_POLL = 20;

/** Narrow adapter surface so tests can supply a fake (no network). */
export interface PollerAdapter {
  listIncoming(createdSince: string, pageToken?: string): Promise<{ items: ReceivedImessage[]; nextPageToken?: string }>;
  replyToPing(m: PhotonMessage): Promise<unknown>;
  replyAck(m: PhotonMessage): Promise<unknown>;
  liveRepliesEnabled(): boolean;
}

export interface PollerStatus { lastPollAt?: string; lastVerifiedMessageAt?: string; lastError?: string; processed: number }

/**
 * Bounded polling of Photon received iMessages from the configured consenting sender only.
 * - Starts from `startedAt` (never ingests history), advances a createdAt cursor, dedupes by message id.
 * - "ping" -> connection-test reply only (no incident). Other text -> sanitized incident.
 * - Replies only when the adapter reports live replies enabled (ENABLE_LIVE_MESSAGING + allowlist).
 */
export function createPhotonPoller(adapter: PollerAdapter, ingest: (r: ExternalReport) => Promise<IngestOutcome>, startedAt = new Date().toISOString()) {
  let cursor = startedAt;
  const seen = new Set<string>();
  const status: PollerStatus = { processed: 0 };

  async function handle(m: ReceivedImessage): Promise<void> {
    const text = messageText(m).trim();
    if (text.toLowerCase() === 'ping') {
      if (adapter.liveRepliesEnabled()) await adapter.replyToPing(m);
      return;
    }
    const summary = sanitizeSummary(`iMessage report: ${text}`);
    if (summary === 'iMessage report:') return;
    const outcome = await ingest({ eventId: externalEventId('ph', m.id), source: 'photon_imessage', summary });
    if (outcome === 'created' && adapter.liveRepliesEnabled()) await adapter.replyAck(m);
  }

  async function pollOnce(): Promise<number> {
    let handled = 0;
    try {
      const page = await adapter.listIncoming(cursor);
      for (const m of page.items.slice(0, MAX_MESSAGES_PER_POLL)) {
        if (seen.has(m.id)) continue;
        await handle(m);
        seen.add(m.id);
        if (m.createdAt > cursor) cursor = m.createdAt;
        handled++;
        status.processed++;
        status.lastVerifiedMessageAt = new Date().toISOString();
      }
      if (seen.size > 1000) for (const id of [...seen].slice(0, 500)) seen.delete(id);
      status.lastError = undefined;
    } catch (error) {
      // Message text and handles are never logged; only the error class/message.
      status.lastError = error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
    }
    status.lastPollAt = new Date().toISOString();
    return handled;
  }

  function start(intervalMs: number): () => void {
    const every = Math.max(MIN_POLL_INTERVAL_MS, intervalMs);
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    const tick = async () => { if (stopped) return; await pollOnce(); if (!stopped) timer = setTimeout(tick, every); };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }

  return { pollOnce, start, status };
}
