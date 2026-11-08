> Implementation update: local MVP source created. Real module publication and two SDK subscribers verified; connected browser end-to-end and provider round trips remain pending. See README and SETUP.md for exact status.

# 12-hour execution plan and shared checklist

> These are **uncompleted** tasks in a starter repository. Check a task only after verifying its acceptance condition. A team member should claim ownership next to a section when work begins.

## Parallel workstreams

| Owner | Focus | Must provide |
|---|---|---|
| A — Core | SpacetimeDB 2.0 schema, reducers, generated bindings, sample data | Reliable live state and typed operations |
| B — UI | React/Tailwind dashboard, customer view, collector view | Three synchronized, projector-ready interfaces |
| C — Communications | Photon 2.0 iMessage, voice-capable line, ElevenLabs SIP/webhooks | Verified phone call or explicit blocker; ideally iMessage round trip |
| D — Intelligence (if available) | Synthetic scenarios, rule-based analyzer, correlation, controlled decoy runner | Credible before/during/after threat demo |

**Integration agreement:** Agree on the incident/event schema first. Mock fixtures must use the same interfaces as real reducer events so workstreams can merge quickly.

## Hour 0–1 — Foundations and provider feasibility

- [x] Read `AGENTS.md` and current official SpacetimeDB/Photon docs.
- [ ] Bootstrap SpacetimeDB React starter; app loads.
- [ ] Prove one reducer mutation updates two browser clients.
- [ ] Create Photon 2.0 project and inspect available number types and billing.
- [ ] Attempt **inbound voice** setup immediately; confirm an eligible number is obtainable.
- [ ] Identify a genuine iMessage-capable sender if iMessage is part of the live demo.
- [x] Agree on `sourceKind` / demo-vs-live event labels and schemas.

**Gate:** SpacetimeDB is truly working; Photon access issues are identified rather than discovered at the end.

## Hour 1–3 — Primary functionality

- [x] Create incidents, campaigns, indicators, decoy sessions/events, interventions and dedupe records as needed.
- [x] Implement validated incident and session reducer transitions.
- [x] Seed 3 synthetic scam scenarios (delivery fee, fake bank security alert, fraudulent customer support call).
- [ ] Build connected incident feed + campaign graph + live counters.
- [ ] Build customer view with risk, evidence, confidence, next steps, and data-source label.

**Gate:** Two incident variants link to one campaign and both browser views react immediately.

## Hour 3–5 — Decoy and detection

- [ ] Add deterministic scam checks for requests for OTP, card/payment details, urgency, brand impersonation, and suspicious link patterns.
- [ ] Return structured evidence and confidence labels; optionally enrich wording with an LLM.
- [ ] Implement controlled first-party mock collector and a small synthetic persona library.
- [x] Add operator-triggered bounded decoy run (never third-party traffic, never unbounded loops).
- [ ] Chart actual simulated collector data; show decoy ratio and counts honestly.

**Gate:** One click starts a decoy session; events increment in SpacetimeDB and both dashboards visibly update.

## Hour 5–8 — Communications + end-to-end flow

- [ ] Connect Photon inbound iMessage (if line and eligible sender available). _Code: opt-in polling worker + unit tests (overnight/integrations). Pending: real sender/line + first live poll._
- [ ] Reply once to an allowlisted team-owned test conversation, with idempotency and status tracking. _Code: `replyAck`/`replyToPing` with idempotency keys, gated by ENABLE_LIVE_MESSAGING + allowlist. Not sent yet._
- [ ] Complete Photon -> ElevenLabs inbound SIP call; verify two-way audio with a phone.
- [ ] Connect post-call event or verified provider status -> gateway -> incident (or document blocker). _Code + signed synthetic end-to-end test pass (`npm run test:webhook`). Pending: real call + public HTTPS tunnel._
- [x] Show provider status in UI: live, unavailable, or simulated.
- [ ] Integrate all three UI views with production reducers and scenario controller.

**Gate:** Show at least one complete real provider event if available, without causing the demo to fail if unavailable.

## Hour 8–10 — Freeze features and polish

- [ ] Improve command-center visual hierarchy, animation of new events, typography, and status contrast.
- [ ] Provide a single `Reset demo` button that only affects team-owned synthetic data.
- [ ] Add loading/error states and dedupe/reconnect handling.
- [ ] Run one full scripted demonstration on the presentation machine.
- [x] Make every `SIMULATED` and `LIVE` indicator reflect actual provenance. _Labels derive from stored `sourceKind`; status upgrades only after a verified event. Not yet eyeballed in a browser._

**Gate:** No additional architectural rewrites. Full demonstration takes under three minutes.

## Hour 10–12 — Verify, pitch, rehearse

- [x] Typecheck/build/test; record commands and results in README.
- [x] Test reducer state transitions, campaign matching, duplicate provider events, and unauthorized operator actions.
- [x] Verify no credentials/real contacts in frontend bundles or public tables. _Bundle scanned against .env values (2026-11-08); webhook test asserts transcript/phone/provider ID absent from incidents._
- [ ] Capture real fallback evidence (screen recording of verified integrations) if permitted.
- [ ] Test no-network fallback and explain what is simulated.
- [ ] Rehearse `docs/DEMO.md` and assign team speaking roles.
- [ ] Update README `Status` truthfully.

## Scope cuts in priority order

Cut these **before** weakening the realtime core: Gmail/Outlook OAuth, external URL fetching, outbound calls, voice cloning, multi-tenancy, accounts/billing, large-scale synthetic persona generation, fancy animated 3D graph, multiple LLMs, arbitrary channel support beyond the chosen iMessage/voice demo.

## Test acceptance criteria

- **Realtime:** New incident is visible on another browser within normal subscription latency without refresh.
- **Correlation:** Two differently worded synthetic phishing messages link via shared evidence, and user can see why.
- **Safety:** A decoy run cannot accept a third-party domain, exceeds neither configured event count nor local rate limits, and cannot trigger unsolicited messages.
- **Idempotency:** Replaying a provider event does not create duplicate incidents.
- **Resilience:** Demo mode works with unset Photon/ElevenLabs/LLM credentials.
- **Honesty:** A fake recording is never labeled as a real Photon integration; simulated collection counts are never described as real-world efficacy.
