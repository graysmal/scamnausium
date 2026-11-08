import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sanitizeSummary } from '../../../../spacetimedb/src/domain';

/** Matches @elevenlabs/elevenlabs-js constructEvent: reject signatures older than 30 minutes. */
export const SIGNATURE_MAX_AGE_SECS = 30 * 60;
/** Extra guard (not in the SDK): reject timestamps far in the future. */
export const SIGNATURE_MAX_SKEW_SECS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verifies `ElevenLabs-Signature: t=<unix>,v0=<hex>` where hex = HMAC-SHA256(secret, `${t}.${rawBody}`).
 * Format taken from the official SDK source (wrapper/webhooks.js, v2.77.0); `rawBody` must be the unmodified request body.
 */
export function verifyElevenLabsSignature(rawBody: string, header: string | undefined, secret: string, nowSecs = Math.floor(Date.now() / 1000)): VerifyResult {
  if (!header) return { ok: false, reason: 'missing signature header' };
  const parts = header.split(',').map(p => p.trim());
  const t = parts.find(p => p.startsWith('t='))?.slice(2);
  const v0 = parts.find(p => p.startsWith('v0='))?.slice(3);
  if (!t || !v0 || !/^\d{1,12}$/.test(t) || !/^[a-f0-9]{64}$/i.test(v0)) return { ok: false, reason: 'malformed signature header' };
  const ts = Number(t);
  if (ts < nowSecs - SIGNATURE_MAX_AGE_SECS) return { ok: false, reason: 'stale timestamp' };
  if (ts > nowSecs + SIGNATURE_MAX_SKEW_SECS) return { ok: false, reason: 'timestamp in the future' };
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const provided = Buffer.from(v0, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

export interface CallMeta { startedAtSecs: number; durationSecs: number; title: string }
export type ParsedCall =
  | { kind: 'incident'; eventId: string; summary: string; call: CallMeta }
  | { kind: 'ignored'; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Incident text for a finished call: the title first so it becomes the headline. */
export function callReportText(title: string, summary: string): string {
  const head = title.trim() ? title.trim().replace(/[.!?]*$/, '.') : 'Honeypot call.';
  return sanitizeSummary(`${head} ${summary.trim()}`);
}

/** Opaque, stable incident id: provider ids are never stored in public tables. */
export function externalEventId(prefix: 'el' | 'ph' | 'rp', providerId: string): string {
  return `${prefix}-${createHash('sha256').update(providerId).digest('hex').slice(0, 32)}`;
}

/**
 * Maps a verified post-call webhook to a sanitized incident. Uses only `analysis.transcript_summary`;
 * the raw `transcript` is never read or stored.
 */
export function parsePostCall(payload: unknown, expectedAgentId: string | undefined): ParsedCall {
  if (!isRecord(payload)) return { kind: 'ignored', reason: 'payload is not an object' };
  if (payload.type !== 'post_call_transcription') return { kind: 'ignored', reason: `unsupported type ${String(payload.type).slice(0, 40)}` };
  const data = payload.data;
  if (!isRecord(data)) return { kind: 'ignored', reason: 'missing data' };
  if (expectedAgentId && data.agent_id !== expectedAgentId) return { kind: 'ignored', reason: 'agent_id does not match ELEVENLABS_AGENT_ID' };
  const conversationId = data.conversation_id;
  if (typeof conversationId !== 'string' || !conversationId || conversationId.length > 200) return { kind: 'ignored', reason: 'missing conversation_id' };
  const analysis = isRecord(data.analysis) ? data.analysis : undefined;
  const rawSummary = typeof analysis?.transcript_summary === 'string' ? analysis.transcript_summary : '';
  if (!rawSummary.trim()) return { kind: 'ignored', reason: 'no transcript_summary in analysis' };
  const title = typeof analysis?.call_summary_title === 'string' ? analysis.call_summary_title : '';
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    kind: 'incident', eventId: externalEventId('el', conversationId), summary: callReportText(title, rawSummary),
    call: { startedAtSecs: num(metadata.start_time_unix_secs) || Math.floor(Date.now() / 1000), durationSecs: Math.round(num(metadata.call_duration_secs)), title: sanitizeSummary(title, 120) },
  };
}
