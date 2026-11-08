# Integration playbook — SpacetimeDB, Photon 2.0, voice

> APIs change. **Consult the linked official docs before writing SDK-specific calls.** Do not copy older Photon Spectrum or SpacetimeDB 1.x examples into a 2.0 project.

## 1. SpacetimeDB 2.0 — do this first

- Install/check a current `spacetime` CLI and use the React/TypeScript starter: `spacetime dev --template react-ts`.
- Edit server module `spacetimedb/src/index.ts`, generate client bindings, and subscribe in React using current `spacetimedb/react` APIs.
- Verify a reducer update appears on two open browsers **without refresh** before working on dashboard polish.
- Use public tables **only for synthetic/sanitized demo data**; private data must not be subscribed by random connected clients.
- If current SDK setup differs from these notes, adapt to official docs and update README with actual commands.

Docs: https://spacetimedb.com/docs/quickstarts/react/ · https://spacetimedb.com/docs/clients/typescript/ · https://spacetimedb.com/docs/functions/reducers/ · https://spacetimedb.com/agent-setup.md

## 2. Photon 2.0 — project prerequisites

Photon 2.0 uses a unified API and managed messaging. It is not an OS-level interceptor. Its SDK/package and objects can differ from older Photon Spectrum examples.

1. Create a Photon 2.0 project and API key with required scopes. Check **current** pricing/limits and available number types.
2. Confirm one iMessage-capable team member can initiate a conversation with a shared line, if available. **Shared lines cannot initiate unsolicited first messages.**
3. Separately obtain/identify an **eligible voice-capable number**. A shared iMessage line **cannot take calls**.
4. Use the current `@photon-ai/api` SDK or official REST API, plus server-only environment secrets. Build `PhotonAdapter` exposing minimal `listIncoming`, `replyToMessage`, and `getStatus` operations as supported by current docs.
5. Map provider event IDs to incident records and handle retry/idempotency. A message accepted for dispatch is not automatically confirmed delivered.
6. Require `ENABLE_LIVE_MESSAGING=true` and `ALLOWED_TEST_CONTACTS` for any outbound message. No unsolicited messages to unknown senders.

Docs: https://photon.codes/docs/beta/get-started/imessage · https://photon.codes/blog/introducing-photon-2.0

## 3. Voice — highest-priority integration risk

**Preferred path:** Team-controlled smartphone -> eligible Photon number -> inbound SIP -> ElevenLabs voice agent -> verified post-call webhook -> gateway -> SpacetimeDB incident.

- Configure and publish a conversational voice agent first. Use a clearly fictional adult persona who can respond plausibly to a **scripted, consenting role-play caller**. Do not collect usable identity/financial data.
- In Photon, choose a voice-capable number, set a voice profile with inbound SIP. The official ElevenLabs recipe uses `sips:sip.rtc.elevenlabs.io:5061` with TLS; confirm details in docs when setting up.
- Import the number into ElevenLabs as a SIP trunk and assign the published agent.
- Call from a separate team-owned phone; confirm two-way audio and normal call termination. Merely seeing a saved SIP destination is **not** verification.
- Configure an ElevenLabs post-call transcription webhook if desired; verify authenticity per vendor instructions, minimize/avoid transcript retention, and deduplicate by provider conversation ID. Display a *summary* linked to a campaign.
- Do not assume you can call back spoofed scam numbers or intercept third-party calls. Do not depend on external scammers leaving voicemail.
- If live voice setup cannot be completed, run the scripted voice simulation with a conspicuous `SIMULATED` label, and document the missing prerequisite; never claim the Photon voice prize integration is complete.

Docs: https://photon.codes/docs/beta/get-started/voice · https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks

## 4. Suggested environment variables (names are proposed)

When scaffolding, create `.env.example` with **placeholders only**:

```dotenv
# Gateway / application
PORT=4000
NODE_ENV=development
DEMO_MODE=true
OPERATOR_DEMO_SECRET=replace-with-local-secret
ALLOWED_TEST_CONTACTS=+14155550100
ENABLE_LIVE_MESSAGING=false
MAX_DECOY_EVENTS_PER_RUN=50

# SpacetimeDB (use actual SDK config names once verified)
SPACETIMEDB_URI=http://127.0.0.1:3000
SPACETIMEDB_DATABASE=scamnausium
SPACETIMEDB_SERVICE_TOKEN=

# Photon 2.0 server-side only
PHOTON_API_KEY=
PHOTON_PROJECT_ID=
PHOTON_AGENT_USER_ID=
PHOTON_VOICE_PROFILE_ID=

# Optional: must remain server-side
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_WEBHOOK_SECRET=
LLM_API_KEY=
```

Never place secrets in `VITE_*` variables; Vite exposes them to the browser. Use a real secret for local protection and keep `.env` ignored. The example test phone number is a placeholder, not a usable test identity.

## 5. Definition of "integrated"

| Capability | Not integrated | Verified integrated |
|---|---|---|
| SpacetimeDB | Client-only fake counter | Reducer mutation changes two live subscribed views |
| Photon iMessage | Static mock chat screenshot | Team member sends native iMessage; project reads it and responds; delivery tracked |
| Photon voice | ElevenLabs preview widget | Real phone calls Photon number; SIP audio both ways; call event observed |
| Voice analysis | Hardcoded transcript labeled live | Verified real call event with authorized post-call summary |
| Decoy simulation | Prebaked chart that animates | Bounded controlled events written through gateway/reducers |

## 6. Fast failure protocol

- At hour 1, if voice number/SIP provisioning is blocked, keep **one** teammate investigating while others build the app. Avoid blocking core MVP.
- At hour 3, if iMessage isn't available (no iPhone/Mac sender or line), prioritize voice and synthetic inbox. Do not mislabel SMS as iMessage.
- At hour 8, freeze provider changes except small fixes to already working integrations.
- Keep a genuine screen recording of any verified live call/message as an on-stage fallback, labeled `RECORDED LIVE TEST` (distinct from `SIMULATED`).

## 7. Implemented ingestion (branch `overnight/integrations`, 2026-11-08)

**ElevenLabs → incident.** `POST /webhooks/elevenlabs` on the gateway.
1. ElevenLabs agent → Post-call webhook → type *transcription*, URL `https://<your-tunnel>/webhooks/elevenlabs`. Copy the HMAC secret into `ELEVENLABS_WEBHOOK_SECRET`; set `ELEVENLABS_AGENT_ID`.
2. The gateway listens on `127.0.0.1` only. Expose it with a tunnel you control (e.g. `cloudflared tunnel --url http://127.0.0.1:4000`) only for the duration of the test.
3. Signature: `ElevenLabs-Signature: t=<unix>,v0=<hex HMAC-SHA256(secret, "t.rawBody")>`, max age 30 min. Taken from the official JS SDK source because the docs don't spell it out.
4. Only `data.analysis.transcript_summary` is used, sanitized; the transcript is never read. Incident id = `el-` + sha256(conversation_id). Replays → `duplicate`. DB down → 503 so ElevenLabs can retry (enable retries on the webhook).
5. Status in the UI changes to "Verified call event" only after a signature-verified event is ingested.

**Photon iMessage → incident.** Polling, not webhooks: Photon webhooks need a public HTTPS URL and their payload schema is only in an authenticated catalog; the typed `listMessages` API is documented and already in the SDK.
1. Fill `PHOTON_AGENT_HANDLE` (assigned shared line) and `PHOTON_TEST_SENDER` (your iMessage phone/email exactly as in Settings → Messages → Send & Receive).
2. `ENABLE_PHOTON_POLLING=true` → read-only polling every ≥5 s from gateway start time (no history import), max 20 messages per poll, configured sender only.
3. Replies (`ping` connection test, report acknowledgement) additionally require `ENABLE_LIVE_MESSAGING=true` and the sender in `ALLOWED_TEST_CONTACTS`. Idempotency keys: `scamnasium-ping:<id>`, `scamnasium-ack:<id>`.
