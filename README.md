# scamnasium

> **Latest work and how to run it: [docs/HANDOFF.md](docs/HANDOFF.md).**

Collective scam defense: check any text or email, link reports into campaigns, and run an AI honeypot phone line that wastes scammers' time. Everything lives in one real-time SpacetimeDB state shared by every screen.

## What works

- **Check a message.** Paste a text or full email, or drop a raw `.eml` (headers, MIME and HTML decoded; failed SPF/DKIM/DMARC flagged). An explainable rules analyzer flags brand impersonation, lookalike, shortened or IP links, sender and reply-to mismatches, gift-card, crypto, code and password requests, threats, urgency, and authority pretexts. Every flag is shown in plain language with low, medium or high confidence.
- **Campaigns.** Reports are grouped by tactic and impersonated brand. Link domains and brands shared by two or more reports connect campaigns in an interactive Cytoscape graph (drag, select, zoom).
- **Honeypot calls.** Photon number → ElevenLabs agent. The gateway polls ElevenLabs (read-only, no tunnel). A live call appears on the graph, and its summary is filed as a report when it ends. A signed post-call webhook is also supported. The stats show **Caller time wasted**.
- **iMessage.** Optional polling of a Photon line. A forwarded message is filed and, if enabled for allowlisted contacts, answered with the verdict.
- **Customer view.** Anyone can paste a message and get a plain-language verdict computed in the browser (nothing is sent), with a note when it matches a known campaign and an opt-in "Report to protect others". A browser extension adds a right-click "Check with scamnasium".
- **Mock collector.** A bounded first-party simulation of decoys diluting a scammer's list. No external traffic.
- **Privacy.** Public tables hold sanitized summaries only: no transcripts, phone numbers, email usernames or provider IDs. Provenance is shown on every report.

## Status (2026-11-08)
- **Verified locally:** database, gateway, analyzer, all four views, raw email decoding, extension handoff, signed ElevenLabs webhook (synthetic payloads), and gateway auto-reconnect. `npm test`, `test:smoke`, `test:gateway` and `test:webhook` pass.
- **Written, not verified against real services:** ElevenLabs call polling (needs the API key), Photon iMessage polling and replies, and the voice-agent update script (preview by default, never applied).
- **Not done:** a real end-to-end call through the new app path, and a rehearsal on the presentation machine.

## Run on your machine

Use Node.js 24.22.1+ (tested) and SpacetimeDB CLI **2.14.1**. From the extracted `scamnasium` folder:

```bash
# Install CLI if needed, following the official vendor installer:
curl -sSf https://install.spacetimedb.com | sh -s -- --yes
export PATH="$HOME/.local/bin:$PATH"
npm ci
npm ci --prefix spacetimedb
```

Terminal 1 — keep the database running:

```bash
spacetime start --listen-addr 127.0.0.1:3000
```

Terminal 2 — publish using the local CLI identity, initialize private config, start gateway:

```bash
spacetime publish scamnasium --server local --yes   # add --delete-data once if you published an older schema
npm run setup:local
npm run gateway
```

Terminal 3:

```bash
npm run dev
```

Open http://localhost:5173. Open `.env` locally and copy `OPERATOR_DEMO_SECRET` into the dashboard operator field. It remains in page memory only; the database service token stays on the server. Never share or commit `.env`. The setup script preserves an existing `.env`.

No Photon, ElevenLabs or hosted SpacetimeDB account is required for this local demo. The module publisher is its sole operator. Publish and run `setup:local` using the same CLI identity. Do not expose this local prototype to the internet without deployment/auth hardening.

### Demo

Open two browser windows. Enter the operator secret in one. Inject **Delivery**, then **Variant**. Both should show one campaign with two reports. Select a report, launch controlled decoys, then open Mock collector in the second window. It should reach 12 records and 75% decoys. Show customer guidance, then click **Mark guidance shown**. All content is labeled simulated.

## Provider setup

See [docs/SETUP.md](docs/SETUP.md) for the account steps to complete now. Do not paste API keys into chat. Put them in your local `.env` only. Live messaging stays disabled by default.

## Verification

```bash
npm run check
npm test                 # unit: domain + provider ingestion (14 tests)
npm run build
# With local SpacetimeDB running and .env populated:
npm run test:smoke
# With gateway also running:
npm run test:gateway
# With gateway running and test values for ELEVENLABS_WEBHOOK_SECRET / ELEVENLABS_AGENT_ID:
npm run test:webhook
```

Tip: to test without touching your real `.env`, point dotenv at another file: `DOTENV_CONFIG_PATH=/path/to/test.env npm run gateway`.

**The smoke and webhook tests reset the named local synthetic demo database.** Do not point it at a shared judging session. Gateway test injects a synthetic bank event.

Verified in the build environment:

- Frontend, module, gateway and adapter typechecks passed.
- Two unit tests passed (correlation and state transitions).
- Module built and published to a real local SpacetimeDB instance.
- Two independent SDK subscribers received reducer mutations; dedupe, invalid transitions, authorization, event caps and a fresh reconnect snapshot passed.
- Gateway status, unauthorized requests, authenticated injection and rate limits passed.
- Production frontend build passed.
- Browser inspection confirmed dashboard and setup navigation/rendering in the disconnected state. Full connected browser interaction is not yet verified; the browser preview and database test ran in separate network environments.

## Implementation notes

Generated bindings are committed to this starter. After schema changes run `npm run generate` and republish. Client state is never authoritative. The Node gateway holds one database connection; on disconnect restart the gateway after restoring the server. Browser reconnect recovery beyond a fresh connection is a remaining test item.

Public tables contain synthetic summaries only. The collector uses events as records; there is no arbitrary URL input or network submission. Simulation is fixed at 12 records and up to 20 sessions before reset. This is not a measurement of real scam prevention.

The initial spec says “scamnausium”; the implementation follows the project name “scamnasium.” It uses plain CSS for this first slice rather than adding Tailwind. State transitions are intentionally separate reducers for testability; the gateway runs analysis/linking in order. A gateway failure mid-flow can leave a reported/analyzed row; reset and rerun the synthetic demo while recovery controls are pending.

No hosting deployment or GitHub push has been performed. This archive is a runnable source starter, not a hosted full-stack service.

## Browser extension
Right-click any selected text → **Check with scamnasium** opens the Customer tab with the text checked locally. Load `extension/` unpacked in Chrome; see [`extension/README.md`](extension/README.md).
