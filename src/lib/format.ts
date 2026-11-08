import type { Timestamp } from 'spacetimedb';

export const toMs = (t: Timestamp) => Number(t.microsSinceUnixEpoch / 1000n);

export function timeAgo(t: Timestamp, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - toMs(t)) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(toMs(t)).toLocaleDateString();
}

export function duration(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const CHANNEL_LABEL: Record<string, string> = {sms: 'Text', email: 'Email', call: 'Call', imessage: 'iMessage'};

/** Where an incident came from, derived only from the stored sourceKind. */
export function provenance(sourceKind: string): {label: string; tone: 'sim' | 'live' | 'report' | 'unknown'} {
  switch (sourceKind) {
    case 'manual_demo': return {label: 'Simulated', tone: 'sim'};
    case 'voice_simulation': return {label: 'Simulated call', tone: 'sim'};
    case 'operator_report': return {label: 'Reported', tone: 'report'};
    case 'elevenlabs_call': return {label: 'Honeypot call', tone: 'live'};
    case 'photon_imessage': return {label: 'iMessage', tone: 'live'};
    default: return {label: 'Unknown source', tone: 'unknown'};
  }
}

export const RISK_LABEL: Record<string, string> = {high: 'High risk', medium: 'Medium risk', low: 'Low risk'};
export const STATUS_STEPS = ['reported', 'analyzed', 'linked', 'protected'] as const;
