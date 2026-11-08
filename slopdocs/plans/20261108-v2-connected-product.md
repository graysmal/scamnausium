# Plan: v2 — calls in the app, message analysis, UI rebuild, voice prompt

Branch `overnight/v2` (from `overnight/integrations`). Local only, not pushed. Runs unattended: no approvals, no paid/outbound provider calls, never dial the honeypot number.

## Inputs (teammate feedback, 2026-11-08)
- Call path works outside the app: Photon number -> SIP -> ElevenLabs agent. Problems: agent admits it's a scam (our SETUP.md prompt literally said "Introduce the session as a simulation"), doesn't hang up after goodbye (end_call tool not enabled), sounds like over-excited AI.
- UI: hates green, gradients, operator controls at bottom, "obviously AI slop / overdone". Wants node web with a real JS lib (select/drag). Wants bespoke look.
- Product: must analyze emails/texts, not only calls. Emails were rendered badly.
- Web UI <-> DB connected; ElevenLabs <-> Photon connected; app <-> phone line NOT connected. That's the main gap.

## Decisions
1. **Calls via ElevenLabs conversations polling** (`GET /v1/convai/conversations?agent_id&summary_mode=include&call_start_after_unix&page_size`), header `xi-api-key`. Read-only, free, no tunnel. Fields (wire, from SDK 2.77 serialization): conversation_id, agent_id, status (initiated|in-progress|processing|done|failed), start_time_unix_secs, call_duration_secs, transcript_summary?, call_summary_title?. Opt-in `ENABLE_ELEVENLABS_POLLING`, min interval 8s. Webhook path stays as an alternative.
2. New public table `calls` (id = el-<hash>, status, startedAt, durationSecs, title). Call id == incident id once summarized, so UI joins by id. Shows live "call in progress".
3. **Analyzer v2** in domain.ts: parse email headers (From/Subject/Reply-To), explainable weighted signals, brand table w/ official domains (mismatch = strong signal), link heuristics (shortener, raw IP, punycode, risky TLD, lookalike digits, http). Campaign key = `tactic:brand`. Indicators get `kind` + `fingerprint` (spec fields) so shared link domains connect incidents across campaigns in the graph.
4. Schema changes -> republish with `--delete-data` locally (demo data only). Documented.
5. Operator paste flow: `POST /api/report` {text, channel?} -> sanitize -> `reportExternalIncident(source=operator_report, eventId=rp-<sha(text)>)` -> analyze -> link. Same text twice = dedupe.
6. Sanitization: strip URL query/fragment, redact email local parts (keep domain), phone numbers, 4+ digit runs.
7. UI: Cytoscape (pinned 3.33.1). Light neutral palette, single warm accent for risk, blue for provider. No gradients. Layout = top bar / left operator rail / center graph / right inspector. Minimal copy.
8. Voice agent: prompt in `docs/voice-agent-prompt.md`; `scripts/apply-agent-prompt.ts` (GET + local backup, PATCH conversation_config.agent.{first_message,prompt.prompt,prompt.built_in_tools.end_call}); dry-run by default. Not executed by agent.

## Tasks
- [ ] domain v2 analyzer + parser + sanitizer
- [ ] module: schema (indicators kind/fingerprint, campaigns brand/tactic, incidents headline/senderDomain, calls), reducers
- [ ] gateway: /api/report, ElevenLabs poller, call upserts, status
- [ ] frontend rebuild w/ Cytoscape
- [ ] voice prompt + apply script
- [ ] update tests to new keys; smokes pass
- [ ] docs/README/TASKS/slopdocs
