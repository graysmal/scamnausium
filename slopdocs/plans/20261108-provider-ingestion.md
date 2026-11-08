# Plan: provider ingestion (ElevenLabs post-call webhook + Photon iMessage polling)

Branch: `overnight/integrations` (local, not pushed). Base: `chore/gitignore-slopdocs` (= master 38a1d45 + gitignore/slopdocs).

## Goal
Real provider events become incidents in SpacetimeDB with honest provenance, without ever storing raw transcripts/handles in public tables, and without the gateway sending anything unless explicitly enabled.

## Verified facts (2026-11-08)
- Baseline on this Mac: `npm run check`, `npm test` (2/2), `test:smoke`, `tests/gateway-smoke.ts` all PASS against local SpacetimeDB 2.14.1.
- User's `.env` SPACETIMEDB_SERVICE_TOKEN != this Mac's CLI identity -> gateway would get "Operator only". Testing uses scratch env via `DOTENV_CONFIG_PATH`. Do not edit user's `.env`.
- ElevenLabs signature (from @elevenlabs/elevenlabs-js 2.77.0 `wrapper/webhooks.js`, docs don't specify):
  header `ElevenLabs-Signature: t=<unix secs>,v0=<hex>`; hex = HMAC-SHA256(key=secret utf8, msg=`${t}.${rawBody}`); reject if t older than 30 min. Must hash RAW body.
- ElevenLabs payload: `{type:"post_call_transcription", event_timestamp, data:{agent_id, conversation_id, status, transcript[], metadata{call_duration_secs,...}, analysis{transcript_summary, call_successful}}}`. Retries off by default; retryable on 5xx/429/408; must 200. Dedupe on conversation_id.
- Photon 2.0 webhooks: Standard Webhooks, HTTPS public only (localhost blocked), payload schema only via authenticated event-types catalog; SDK 0.6.0 has NO webhook payload types. Polling `projects.listMessages` IS fully typed and already used by `adapters/photon.ts`.

## Decisions
1. Photon inbound = bounded polling worker, not webhook. Reason: typed + documented, no tunnel, no guessed schema. Off unless `ENABLE_PHOTON_POLLING=true`. Interval >= 5s, max 20 msgs/poll, only configured `PHOTON_TEST_SENDER` -> `PHOTON_AGENT_HANDLE` direct text.
2. ElevenLabs = webhook at `/webhooks/elevenlabs` (outside `/api` operator auth; auth = HMAC). Needs a tunnel to receive real calls (documented, not run by agent). Hand-rolled verify w/ timingSafeEqual (no SDK dep).
3. New reducer `reportExternalIncident({eventId, source, summary})`; source in {elevenlabs_call, photon_imessage}. Incident id = `el-`/`ph-` + sha256(providerId)[0:32] -> idempotent via primary key. Never store conversation_id/handles raw.
4. Summary sanitized twice (gateway + reducer, shared `sanitizeSummary` in domain.ts): redact emails, phone-like/4+ digit runs, strip control chars, 400 char cap. ElevenLabs: only `analysis.transcript_summary`, never `transcript`.
5. `analyze()` gains `unclassified` (no evidence -> low confidence, no campaign). Previously anything unmatched became "Bank credential lure" — wrong for real input. Gateway skips `linkIncident` for unclassified. State machine allows `analyzed -> protected` so guidance can still be shown.
6. Outbound iMessage reply stays behind `ENABLE_LIVE_MESSAGING=true` + allowlist + idempotency key `scamnasium-ack:<msgId>`.
7. UI provenance from `sourceKind`: manual_demo=SIMULATED, voice_simulation=SIMULATED VOICE, elevenlabs_call=PROVIDER CALL, photon_imessage=PROVIDER iMESSAGE. Status strings: Not configured / Awaiting verification / Verified event received <time>. Never "Live" from config alone.

## Tasks
- [x] domain: sanitizeSummary, unclassified analysis, analyzed->protected (+unit tests)
- [x] module: reportExternalIncident; regenerate bindings; republish
- [x] gateway: elevenlabs verify/parse module (+unit tests incl. tampered/stale/wrong agent)
- [x] gateway: serialized ingest helper (dedupe -> report -> analyze -> link?)
- [x] gateway: mount webhook w/ raw body; status reflects verified events
- [x] gateway: photon poller + gated ack reply (+unit test w/ fake adapter)
- [x] frontend: provenance badges, customer button on analyzed
- [x] smoke: signed webhook fixture -> incident, replay deduped, bad sig 401
- [x] docs: .env.example, README, TASKS, INTEGRATIONS, slopdocs feature doc
- [ ] browser check of full demo — NOT DONE: no browser automation tool in session
