import { useEffect, useState, type FormEvent } from 'react';
import type { Calls } from '../module_bindings/types';
import { duration, toMs } from '../lib/format';
import type { Action, GatewayStatus } from '../lib/api';

type Channel = 'auto' | 'sms' | 'email' | 'imessage';

interface Props {
  secret: string;
  onSecret: (value: string) => void;
  busy: boolean;
  calls: readonly Calls[];
  status: GatewayStatus;
  onReport: (text: string, channel: Channel) => Promise<boolean>;
  onAction: (action: Action) => void;
  onOpenIncident: (id: string) => void;
  incidentIds: ReadonlySet<string>;
}

const SCENARIOS: {id: 'delivery' | 'variant' | 'bank' | 'voice'; label: string}[] = [
  {id: 'delivery', label: 'USPS fee text'},
  {id: 'variant', label: 'USPS variant'},
  {id: 'bank', label: 'Chase login email'},
  {id: 'voice', label: 'Amazon code call'},
];

const SAMPLE = `From: "PayPal" <service@paypa1-billing.example.com>
Subject: Your account has been limited

We noticed unusual activity on your account. Log in within 24 hours to restore access:
http://bit.ly/restore-access`;

/** Ticks once a second while any call is live so elapsed time updates. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function OperatorRail({secret, onSecret, busy, calls, status, onReport, onAction, onOpenIncident, incidentIds}: Props) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<Channel>('auto');
  const locked = !secret;
  const ordered = [...calls].sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt)).slice(0, 6);
  const anyLive = ordered.some(c => c.status === 'in_progress' || c.status === 'ringing');
  const now = useNow(anyLive);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await onReport(text, channel)) setText('');
  }

  return (
    <aside className="rail">
      <section className="rail-block">
        <label className="field-label" htmlFor="operator-key">Operator key</label>
        <input id="operator-key" type="password" autoComplete="off" spellCheck={false} value={secret}
          onChange={e => onSecret(e.target.value.trim())} placeholder="Paste from .env" />
      </section>

      <form className="rail-block" onSubmit={submit}>
        <div className="block-head">
          <h2>Check a message</h2>
          <button type="button" className="link" onClick={() => setText(SAMPLE)}>Use sample</button>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={7} maxLength={4000}
          placeholder="Paste a suspicious text or a full email, headers included." aria-label="Message to check" />
        <div className="row">
          <select value={channel} onChange={e => setChannel(e.target.value as Channel)} aria-label="Channel">
            <option value="auto">Detect type</option>
            <option value="sms">Text message</option>
            <option value="email">Email</option>
            <option value="imessage">iMessage</option>
          </select>
          <button type="submit" className="primary" disabled={locked || busy || !text.trim()}>{busy ? 'Checking…' : 'Check'}</button>
        </div>
      </form>

      <section className="rail-block">
        <div className="block-head">
          <h2>Honeypot calls</h2>
          <span className={`state state-${status.voice.state}`}>{status.voice.state === 'active' ? 'Live' : status.voice.state === 'verified' || status.voice.state === 'waiting' ? 'Watching' : 'Off'}</span>
        </div>
        {status.honeypotNumber && <p className="number">{status.honeypotNumber}</p>}
        {ordered.length === 0 ? <p className="quiet">{status.voice.detail}</p> : (
          <ul className="calls">
            {ordered.map(c => {
              const live = c.status === 'in_progress' || c.status === 'ringing';
              const secs = live ? (now - toMs(c.startedAt)) / 1000 : c.durationSecs;
              const summarized = incidentIds.has(c.id);
              return (
                <li key={c.id}>
                  <button type="button" className="call" disabled={!summarized} onClick={() => onOpenIncident(c.id)}>
                    <span className={live ? 'pulse' : 'dot-quiet'} aria-hidden />
                    <span className="call-title">{live ? 'In progress' : c.title || (c.status === 'processing' ? 'Summarizing…' : 'Call ended')}</span>
                    <span className="mono">{duration(secs)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rail-block">
        <h2>Demo scenarios</h2>
        <div className="chips">
          {SCENARIOS.map(s => (
            <button key={s.id} type="button" disabled={locked || busy} onClick={() => onAction({action: 'inject', scenarioId: s.id})}>{s.label}</button>
          ))}
        </div>
      </section>

      <div className="rail-foot">
        <button type="button" className="link danger" disabled={locked || busy}
          onClick={() => { if (window.confirm('Clear all incidents, calls and collector records?')) onAction({action: 'reset'}); }}>
          Reset demo data
        </button>
      </div>
    </aside>
  );
}
