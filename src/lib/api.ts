import { useEffect, useState } from 'react';

export type ProviderState = 'off' | 'waiting' | 'active' | 'verified' | 'error';
export interface ProviderStatus { state: ProviderState; detail: string }
export interface GatewayStatus {
  reachable: boolean;
  database: 'Connected' | 'Disconnected';
  honeypotNumber: string;
  voice: ProviderStatus;
  messaging: ProviderStatus;
}

const OFFLINE: GatewayStatus = {
  reachable: false, database: 'Disconnected', honeypotNumber: '',
  voice: {state: 'off', detail: 'Gateway offline'}, messaging: {state: 'off', detail: 'Gateway offline'},
};

/** Polls the gateway's public status endpoint. */
export function useGatewayStatus(intervalMs = 4000): GatewayStatus {
  const [status, setStatus] = useState<GatewayStatus>(OFFLINE);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Omit<GatewayStatus, 'reachable'>;
        if (!cancelled) setStatus({...body, reachable: true});
      } catch {
        if (!cancelled) setStatus(OFFLINE);
      }
    };
    void check();
    const id = setInterval(check, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);
  return status;
}

export class ApiError extends Error {}

async function post<T>(path: string, secret: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${secret}`}, body: JSON.stringify(body)});
  } catch {
    throw new ApiError('Gateway is not reachable.');
  }
  const data = (await res.json().catch(() => ({}))) as {error?: string} & T;
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`);
  return data;
}

export type Action =
  | {action: 'inject'; scenarioId: 'delivery' | 'variant' | 'bank' | 'voice'}
  | {action: 'protect'; incidentId: string}
  | {action: 'decoys'; campaignId: string}
  | {action: 'reset'};

export const postAction = (secret: string, action: Action) => post<{ok: true; incidentId?: string}>('/api/action', secret, action);
export const postReport = (secret: string, text: string, channel: 'auto' | 'sms' | 'email' | 'imessage') =>
  post<{ok: true; incidentId: string; outcome: 'created' | 'resumed' | 'duplicate'}>('/api/report', secret, {text, channel});
