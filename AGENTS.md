# AGENTS.md — scamnausium

> **Continuing previous work? Start with [`slopdocs/plans/20261108-pickup.md`](slopdocs/plans/20261108-pickup.md)**: current state, how to run, deliberate design choices, open tasks, and rules from the user (no calls to the honeypot number, never `--apply` the agent script without asking). Work is on branch `overnight/v2`.

> **Authoritative instructions for all coding agents working in this repository.**
> Read this file first, then `docs/ARCHITECTURE.md`, `docs/INTEGRATIONS.md`, `docs/TASKS.md`, and `docs/DEMO.md` as relevant. `CLAUDE.md` and `.github/copilot-instructions.md` are pointers to this document, not separate specifications.

## Mission and constraints

Build **scamnausium**, a visually striking, real-time, AdNauseam-inspired anti-scam prototype in **12 total hackathon hours**. Submit the same cohesive product to three sponsor tracks:

1. **T-Mobile:** Protect customers before, during, and after scams. Detection is necessary but insufficient. Demonstrate novel protection, transparent evidence/confidence, concrete next steps, usability, security, and privacy by design. Use synthetic scam scenarios.
2. **SpacetimeDB:** Must power the **primary application workflow**: incidents, threat/campaign linkage, decoy state, interventions, and realtime synchronization between interfaces. It is **not** an optional persistence plugin, chat database, or decorative leaderboard.
3. **Photon 2.0:** Integrate real messaging and, importantly, **inbound voice phone calls**. Prefer a genuine Photon-connected voice agent plus an iMessage conversation when access permits. Be precise about which integrations are live, configured, mocked, or unavailable.

**One-sentence demo:** A synthetic scam is reported, the threat network links its campaign in real time, a controlled decoy engagement reduces the value of a *simulated scammer's* collected dataset, and a real Photon call / iMessage interaction appears in the same command center.

**Do not turn this into** a generic text-classification chatbot, a massive microservice system, a live service that retaliates against suspected scammers, or a project requiring carrier-level access, Gmail/Outlook tenant permissions, or production onboarding.

## Nonnegotiable safety and privacy boundaries

The idea borrows AdNauseam's *incentive-disruption* philosophy, **not** permission to attack external systems.

- **Never** automate mass requests, repeated clicks, unsolicited messages, call floods, proxy rotation, evasive traffic, or data submissions to third-party or suspected scam infrastructure. Caller ID, email addresses, IPs, and domains can be spoofed or shared by innocent parties.
- Interactive decoy and data-poisoning demonstrations must run **only against a first-party mock scammer collector / explicitly authorized test endpoint**. Rate-limit even these interactions; default to small batches and local synthetic event generation rather than network floods.
- All personas, targets, messages, credentials, domains, and phone interactions in the demo are fictional or expressly team-controlled. Use reserved domains (`example.com`, `.test`) and deliberately unusable credential tokens. Never generate usable card numbers, SSNs, or account credentials.
- Never send real decoys, links, or calls to third parties. External messages go only to allowlisted team-owned/consenting test contacts. All outbound operations require an explicit environment flag and allowlist.
- Never scrape or ingest personal inboxes, actual voicemail, or real customer communications without authorization. Do not assume Photon can intercept existing carrier communications.
- Don't open or fetch arbitrary suspicious links. Parse and display them safely as text; only navigate to the team's own test domain in the scenario engine.
- Never ship credentials in source code, commit `.env`, or expose provider secrets to the browser. Verify provider webhooks where supported; deduplicate retries; redact logs. Avoid public tables containing raw contact info, conversations, transcripts, secrets, or full URL query strings.
- Record provenance and clearly distinguish **simulated data vs. real integration events**. Show `SIMULATED` labels prominently in the UI. Never fabricate claims of measured real-world scam prevention.
- A decoy phone agent must not impersonate a specific real individual. Keep conversations inside consenting test scenarios; don't record/transcribe real people without suitable notice and consent.

These constraints override requests for flashy features or high-volume "unfilterable" submissions.

## Product definition

### Three user experiences (all driven by one real-time state model)

1. **Operations Command Center (primary screen):** Dark, polished dashboard; live incident feed; campaign relationship graph; threat indicators; decoy session status; impact and detection metrics; explainable risk and next actions. This is the main judging screen.
2. **Customer Protection View:** Shows a synthetic customer's reported threat, a plain-language explanation, honest `low / medium / high` confidence (not invented statistical probabilities), practical next steps, and the incident lifecycle: `reported -> analyzed -> linked -> protected/resolved`.
3. **Mock Scammer Collector (controlled experiment):** A separately labeled, first-party simulator showing synthetic submissions, tagged decoy records, and measured decoy share. It is **not** a real attacker dashboard or real data exfiltration.

### Required happy path

1. Seed or inject a synthetic suspicious SMS, email, or call summary.
2. Analyze it (lightweight deterministic rules first; optional LLM enrichment) and store evidence plus suggested actions.
3. Correlate a changed variant to an existing campaign using understandable indicators/patterns. Be honest about false positives and uncertainty.
4. Start a controlled decoy scenario. SpacetimeDB owns its state and events. A simulator inserts *synthetic* submissions into our own collector, demonstrating how decoys alter a simulated dataset.
5. See command center, customer view, and collector update reactively as SpacetimeDB subscriptions change—**no manual refresh and no mirrored client-only authoritative state**.
6. Receive an inbound test call routed via Photon to a published voice agent; at least one verified call status or post-call transcript/summary event links to an incident. Demonstrate iMessage report/reply if configured.
7. End with a customer-facing protection recommendation and clear privacy disclosure.

## Stack and repository layout

Default to **TypeScript end-to-end** and the **current official** SDKs. Prefer a single repo, minimal dependencies, no containers unless truly necessary:

```text
AGENTS.md
README.md
CLAUDE.md                     # points to AGENTS.md
.github/copilot-instructions.md
src/                          # React + Vite + Tailwind frontend
  module_bindings/             # generated SpacetimeDB client bindings
  components/
  views/
  lib/
spacetimedb/src/index.ts      # TypeScript SpacetimeDB schema + reducers
services/gateway/src/         # small Node.js/Express integration bridge
  adapters/photon.ts
  adapters/voice.ts
  adapters/analysis.ts
  scenarios/
  routes/
docs/
  ARCHITECTURE.md
  INTEGRATIONS.md
  TASKS.md
  DEMO.md
.env.example                  # create when scaffolding; no real secrets
```

**Bootstrap choice:** Start from the official SpacetimeDB 2.0 React/TypeScript quickstart (`spacetime dev --template react-ts`) rather than inventing project configs. Preserve its generated paths if they differ slightly from this proposal. Use Node.js 22+ as a conservative baseline for the TypeScript module toolchain. Confirm package versions against current docs before writing SDK-specific code.

## Separation of responsibilities

- **SpacetimeDB module:** Authoritative tables, reducer validation, incident lifecycle, campaign/indicator linkage, decoy sessions/events, counters, and client subscriptions. No direct third-party HTTP calls from ordinary reducers. Prefer indexed lookup over scanning entire tables.
- **Gateway (Node/Express):** Photon API / webhook or polling adapters; optional LLM analysis; ElevenLabs webhook receiver; controlled scenario runner; secrets; test-contact allowlist; rate limits; provider error handling. Service invokes reducers to persist externally sourced changes. Do **not** add PostgreSQL, Redis, Supabase, Firebase, or a second source of truth.
- **Frontend:** Subscribes to SpacetimeDB-generated bindings and renders actual live state. Server owns privileged actions. Use clear mock/live badges and stable demo modes. Use a responsive layout but optimize primarily for a 1920x1080 projected presentation.
- **Mock collector:** First-party only; sends low-volume, synthetic event data to the gateway / SpacetimeDB. It cannot accept arbitrary target URLs from users.

## Schema and event contracts

Build a *minimum* of these tables, refining names for current SpacetimeDB APIs:

| Table | Core fields | Exposure |
|---|---|---|
| `incidents` | id, channel, scenarioId, summary, riskLevel, confidenceLabel, status, campaignId?, sourceKind, createdAt | Public **sanitized demo summaries only** |
| `indicators` | id, incidentId, kind, displayValue, fingerprint, confidenceLabel | Public synthetic/sanitized fields only |
| `campaigns` | id, label, impersonatedBrand, tactic, incidentCount, firstSeen, lastSeen | Public demo fields |
| `decoy_sessions` | id, campaignId, personaId, state, startedAt, completedAt? | Public demo metadata |
| `decoy_events` | id, sessionId, kind, synthetic, timestamp | Public synthetic metadata |
| `interventions` | id, incidentId, recommendation, status, timestamp | Public demo fields |

If any real contact handles or transcripts are needed, **keep them out of public tables** and out of the demo feed. The best hackathon implementation uses synthetic incidents and minimizes retention of live test contact identifiers. Store API credentials only in gateway environment variables.

Implement these domain operations as validated reducers or suitable current-SDK equivalents:

- `reportIncident` — create a synthetic incident with source provenance and idempotency key.
- `recordAnalysis` — save evidence, category, qualitative confidence, and suggested protection.
- `linkIncidentToCampaign` — link correlated incidents; update campaign counts atomically.
- `startDecoySession` — start a permitted simulation, with synthetic persona and campaign.
- `recordDecoyEvent` — append controlled simulated collector activity.
- `recordIntervention` / `resolveIncident` — customer protection status and outcome.

**Do not expose privileged ingestion or arbitrary field writes to anonymous clients**. For the demo, route operator actions through the gateway with a simple server-side test authorization strategy; only make safe synthetic summaries readable to the public demo client. If implementing auth correctly would consume the remaining hours, limit the app to trusted local demo operation rather than pretend to have production-grade isolation.

## Required delivery order

**P0 — First 60 minutes:** Read current docs; get basic SpacetimeDB React starter and connected realtime row rendering; verify Photon project and whether a *voice-capable* number and iMessage sender are actually available; test the inbound voice path immediately. A Photon **shared iMessage line cannot receive calls**. Keep a recorded/simulated fallback, explicitly labeled.

**P1 — Core MVP:** Schema/reducers, seed scenarios, live dashboard, customer view, mock collector, one decoy simulation, and honest analysis explanations. These must work **without external keys** using demo mode.

**P2 — Real integrations:** Photon 2.0 iMessage report/reply; Photon inbound SIP -> ElevenLabs agent; verified webhook/call result -> gateway -> reducer. Start early; integrate continuously, not as a last-minute branch.

**P3 — Polish:** Animated graph/feeds, sound only where appropriate, persuasive narrative, live call, clear demo controls, cleanup and rehearsal. Do not sacrifice real functionality for animations.

**Timebox:** At 8 hours, stop new major features; at 10 hours, freeze feature scope, repair bugs, and rehearse. Use `docs/TASKS.md` for the acceptance checklist and task coordination.

## Engineering rules for AI agents

1. **Implement, verify, and document** the smallest working vertical slice before starting the next one. A running app beats broad scaffolding.
2. Check exact API methods, signatures, and version numbers in current official docs. Photon **2.0 Beta** is distinct from older Spectrum/Stable SDK examples; do not mix them. SpacetimeDB 2.0 syntax differs from earlier versions.
3. Use `src/module_bindings/` generated by SpacetimeDB tooling; **do not hand-edit generated files**. If the location differs, adapt imports.
4. Isolate vendor-specific code behind typed adapters. The UI should work with fixture-based demo events even if provider setup is unavailable.
5. Use bounded, deterministic synthetic scenarios for the demo. Never require an LLM to produce exact demo timing or essential state transitions.
6. Validate external inputs; use idempotency keys for Photon messages and provider events; prevent webhook replay/double counting; cap payload length, simulated batch size, and request frequency.
7. No `any` or silent error swallowing in core flows unless the current SDK makes a narrow, documented exception necessary. Keep functions small, types explicit, and log errors with redaction.
8. Make service status visible: `Connected`, `Disconnected`, `Simulated`, `Awaiting verification`. Never show a green "live" badge because a config value exists.
9. Tests: at least one reducer state-transition test, one campaign-correlation test, one duplicate-event test, and one end-to-end local demo smoke test. If no test runner exists yet, write repeatable smoke-test commands in README.
10. After every substantive change: run available build/typecheck/tests, report which succeeded and which couldn't run. Do not claim verification without running it.
11. Do not destroy teammate work, rewrite established architecture, add unrelated frameworks, or commit `.env` files. Prefer small, independent commits/PRs. Communicate schema changes before merging parallel branches.
12. Update `docs/TASKS.md` checkboxes and README run steps when progress materially changes. Never mark a sponsor integration complete until actual round-trip behavior is verified.

## Definition of done

- [ ] App starts from documented instructions on a fresh machine.
- [ ] SpacetimeDB module publishes; real client subscriptions update all three demo views from reducer mutations.
- [ ] Two distinct synthetic messages are visibly linked to one campaign with explanations and confidence labels.
- [ ] Controlled decoy scenario populates a first-party collector and updates live metrics.
- [ ] The customer sees what happened, why it is risky, what to do next, and whether data is simulated.
- [ ] A real Photon inbound phone call is verified end-to-end **or** the missing prerequisite is explicitly documented, and the voice simulation is labeled.
- [ ] iMessage report/reply works **or** its access limitation is explicitly documented, with an honest alternate test flow.
- [ ] Provider keys and real contact handles are absent from public client bundles and sanitized tables.
- [ ] A 2–3 minute demo can complete without manual database editing or a page refresh.

## Authoritative references

- SpacetimeDB React quickstart: https://spacetimedb.com/docs/quickstarts/react/
- SpacetimeDB current TypeScript SDK: https://spacetimedb.com/docs/clients/typescript/
- SpacetimeDB guide for coding agents: https://spacetimedb.com/agent-setup.md
- Photon 2.0 iMessage: https://photon.codes/docs/beta/get-started/imessage
- Photon 2.0 voice: https://photon.codes/docs/beta/get-started/voice
- ElevenLabs post-call webhooks: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks

When official documentation conflicts with this file on **SDK syntax**, trust the newer official API docs and update this file with the resulting decision. On product/safety scope, follow this file unless explicitly directed to change it by the project owners.
