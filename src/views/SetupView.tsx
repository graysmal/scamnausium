import type { ReactNode } from 'react';
import type { GatewayStatus, ProviderStatus } from '../lib/api';

function Item({title, status, children}: {title: string; status: ProviderStatus | {state: string; detail: string}; children: ReactNode}) {
  return (
    <section className="setup-item">
      <div className="block-head"><h2>{title}</h2><span className={`state state-${status.state}`}>{status.detail}</span></div>
      <div className="setup-body">{children}</div>
    </section>
  );
}

/** Integration checklist. Status reflects observed activity only, never configuration alone. */
export function SetupView({status, dbActive}: {status: GatewayStatus; dbActive: boolean}) {
  return (
    <div className="setup">
      <Item title="Database" status={{state: dbActive ? 'verified' : 'error', detail: dbActive ? 'Connected' : 'Disconnected'}}>
        <p>Local SpacetimeDB holds every report, campaign, call and decoy record. All three screens subscribe to it live.</p>
        <code>spacetime start · spacetime publish scamnasium --server local</code>
      </Item>
      <Item title="Honeypot calls" status={status.voice}>
        <p>Photon routes the number to the ElevenLabs agent. The gateway reads finished calls from ElevenLabs and files them here.</p>
        <code>ENABLE_ELEVENLABS_POLLING=true · ELEVENLABS_API_KEY · ELEVENLABS_AGENT_ID · HONEYPOT_NUMBER</code>
        <p className="quiet small">Alternative: post-call webhook to <span className="mono">/webhooks/elevenlabs</span> through a tunnel, with ELEVENLABS_WEBHOOK_SECRET.</p>
      </Item>
      <Item title="iMessage reports" status={status.messaging}>
        <p>Texts from the team’s test phone to the Photon line become reports. Replies stay off unless explicitly enabled for allowlisted contacts.</p>
        <code>ENABLE_PHOTON_POLLING=true · PHOTON_AGENT_HANDLE · PHOTON_TEST_SENDER</code>
      </Item>
    </div>
  );
}
