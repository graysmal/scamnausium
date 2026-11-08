# Feature: provider ingestion (ElevenLabs calls, Photon iMessages)

Plan/history: [[../plans/20261108-provider-ingestion.md]]. Human setup steps: docs/INTEGRATIONS.md §7.

## Flow
provider → gateway verify/parse → `createIngestor().ingest()` (serialized promise chain) → reducers `reportExternalIncident` → `analyzeIncident` → `linkIncident` (only if `isLinkable(analyze(summary).key)`).

## Files
- `services/gateway/src/webhooks/elevenlabs.ts` — `verifyElevenLabsSignature`, `parsePostCall`, `externalEventId`.
- `services/gateway/src/ingest.ts` — resumable/idempotent ingest. Resume rule: existing row `reported` → analyze(+link); `analyzed` & linkable → link; else duplicate.
- `services/gateway/src/workers/photonPoller.ts` — cursor = max createdAt seen (starts at gateway boot), `seen` set dedupe, handle() throws → message retried next poll (cursor not advanced).
- `services/gateway/src/adapters/photon.ts` — `isConsentingDirectText` type guard is THE consent filter for both read and reply paths.
- `spacetimedb/src/domain.ts` — `sanitizeSummary` (used in gateway AND reducer), `analyze` keys: parcel-fee | support-otp | bank-login | other-scam | unclassified.

## Invariants (don't "simplify" these away)
- Public `incidents` rows never hold raw transcript, phone/email, provider ids. Reducer re-sanitizes even though gateway already did.
- eventId regex `^(el|ph)-[a-f0-9]{32}$` enforced in reducer; anything else rejected.
- Webhook route is mounted BEFORE `express.json` (needs raw body for HMAC) and outside `/api` (operator-secret auth doesn't apply; HMAC is the auth).
- Status strings only upgrade on verified events. Never show "Live" from config presence (AGENTS.md rule 8).
- `analyzed → protected` is allowed so unlinkable reports can still get guidance.

## Gotchas
- PhotonMessage is a union incl. an `unknown`-typed fallback; boolean predicates lose narrowing → use the `m is ReceivedImessage` guard; `space`/`receivedBy` need inline narrowing before `.id`.
- Generated `find()` returns `null`, not `undefined`.
- ElevenLabs signature format is from SDK source (@elevenlabs/elevenlabs-js 2.77.0 wrapper/webhooks.js); docs only say "use constructEvent".
- Photon event payload for webhooks unknown without authed `GET /v1/projects/{id}/webhooks/event-types`; that's why polling.
