# Handoff (overnight, 2026-11-08)

Branch: `overnight/v2`. It includes `chore/gitignore-slopdocs` and `overnight/integrations`, so merge only this one.

## What changed
- **Phone calls show up in the app.** The gateway polls ElevenLabs' conversations API (read-only, no tunnel needed). A live call shows as "In progress" in the left rail. When it ends, its summary becomes an incident. The ElevenLabs webhook also works if you set up a tunnel.
- **Paste any text or email to check it.** "Check a message" in the left rail. A new rules analyzer looks for brand impersonation, lookalike or shortened links, gift-card and crypto requests, codes and passwords, threats and urgency. Emails are parsed into sender, subject and body.
- **New UI.** No green, no gradients. Controls are on the left, the graph is in the middle (Cytoscape: drag and click nodes), details are on the right. Also a customer view, collector and setup.
- **iMessage polling** (Photon) is built but off by default. Replies are off unless allowlisted.
- **Privacy:** we store only cleaned summaries: no transcripts, phone numbers or email usernames.
- `.gitignore` now blocks every kind of env and key file.

## Run it
```bash
spacetime start                                        # terminal 1
spacetime publish scamnasium --server local --delete-data --yes   # schema changed: wipes local demo data
npm run gateway                                        # terminal 2
npm run dev                                            # terminal 3 → http://localhost:5173
npm run seed                                           # optional demo data (gateway must be running)
```
`.env`: the `SPACETIMEDB_SERVICE_TOKEN` must come from **your own machine** (`spacetime login show --token`). If it doesn't match, every action fails with "Operator only". To show calls:
```
ENABLE_ELEVENLABS_POLLING=true
ELEVENLABS_API_KEY=...        # needs conversations read access
ELEVENLABS_AGENT_ID=...
HONEYPOT_NUMBER=+1 (617) 993-9239
```

## Not done or not verified
- No real call has gone through the new app path yet. The API key wasn't available here. First thing to try: set the vars above, call the number once, and watch the left rail.
- Agent prompt fix is written but **not applied**: `docs/voice-agent-prompt.md`. Preview with `npm run agent:prompt`, apply with `npm run agent:prompt -- --apply` (saves a backup first), or paste it into the dashboard by hand. Also turn on the End call tool.
- The duplicate `scamnasium/` folder from the first commit is still there. Delete it if nobody needs it.

Checks that passed: `npm run check`, `npm test` (15), `npm run build`, `test:smoke`, `test:gateway`, `test:webhook`.
