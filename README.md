# scamnasium

A working local prototype for collective scam defense: synthetic reports, explainable campaign links, customer guidance, and a controlled first-party decoy collector. Built from the official SpacetimeDB React/TypeScript starter.

## What works

- React command center, customer protection, mock collector, and integration setup views.
- SpacetimeDB 2.14.1 authoritative tables, generated TypeScript bindings, live subscriptions.
- Four deterministic scenarios: delivery, parcel variant, bank alert, simulated support call.
- Validated reported → analyzed → linked → protected lifecycle. “Protected” means guidance shown, not a carrier block.
- Bounded collector: 3 synthetic baseline records + 9 tagged synthetic decoys per run; no external target URLs or traffic.
- Private publishing-identity authorization, local gateway operator secret, request limits and reducer idempotency.

**Not integrated yet:** Photon live ingestion/replies, ElevenLabs SIP and verified webhooks. The typed Photon adapter compiles against the installed official SDK but is not wired to a polling worker. No provider requests or messages have been sent. Configured credentials show “Awaiting verification,” never “Live.”

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
spacetime publish scamnasium --server local --yes
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
npm test
npm run build
# With local SpacetimeDB running and .env populated:
npm run test:smoke
# With gateway also running:
node --import tsx tests/gateway-smoke.ts
```

**The smoke test resets the named local synthetic demo database.** Do not point it at a shared judging session. Gateway test injects a synthetic bank event.

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
