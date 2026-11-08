# Demo runbook and judging narrative

> Goal: **2–3 minutes**, three synchronized views, one visible novel protection. Test the exact flow on the actual presentation machine.

## One-liner

**"Scam detectors flag individual messages. scamnausium turns each reported attempt into shared protection—and studies whether believable synthetic decoys can undermine the economics of scam data collection."**

## Demo controls to implement

- `Reset synthetic demo` — clear/reseed only fictional scenarios and local simulation events.
- `Inject delivery scam` — insert a fake delivery-fee SMS.
- `Inject variant` — add a rewritten version with a different synthetic sender but the same campaign pattern.
- `Launch controlled decoys` — run a bounded internal simulator; update collector events and decoy ratio from actual SpacetimeDB rows.
- `Show customer outcome` — switch to a simple explanation and next-step view.
- `Provider status` — distinguish `LIVE VERIFIED`, `SIMULATED`, `RECORDED LIVE TEST`, and `UNAVAILABLE`.

## Synthetic fixtures

### Scenario A — Fake package redelivery

**Message:** "Delivery attempt failed. Confirm delivery details and a $1.25 redelivery fee at `https://parcel-check.example.com/confirm` within 2 hours."

**Expected analysis:** Delivery-company impersonation; urgency; request for payment; off-brand link. Recommendation: open the courier's official app or independently entered address; don't pay through the provided link.

### Scenario B — Campaign variant

**Message:** "Parcel pending: small handling charge required before release. Visit `https://parcel-check.example.com/pay` today."

**Expected relationship:** Same synthetic hostname, same fee collection objective, same delivery impersonation. Don't rely on identical text matching.

### Scenario C — Fictional phone scam

**Team member role-play:** A mock caller attempts to convince a fictional recipient that their account needs urgent verification and requests a one-time password. No real credentials or persons are involved.

**Expected action:** An inbound Photon call reaches the fictional voice agent (if verified); the call/session is summarized as an impersonation + OTP request, and the incident appears in the network. The agent should not provide real personal information or claim to be a real named person.

## Script (approximately 150 seconds)

**0:00–0:20 — Hook.** "Most tools stop at 'this looks suspicious.' Our idea is different: what if one encounter made the whole network safer, and scam data collection itself less reliable?"

**0:20–0:45 — A message arrives.** Inject Scenario A; highlight risk evidence and clear next steps. Point out that the dashboard is using real SpacetimeDB state.

**0:45–1:10 — Network protection.** Inject Scenario B; show campaign link and synchronized changes across two browser windows. State exactly which signals justified the correlation.

**1:10–1:40 — Controlled decoy.** Trigger first-party mock collector; show internally consistent synthetic records entering and decoy-share metric updating. Say: "This is a controlled experiment, not traffic sent to actual scammers."

**1:40–2:15 — Photon live interaction.** Have a teammate call your **verified** Photon voice-capable number (or show genuine recorded evidence if the live network is unreliable). If iMessage is working, show a brief incoming report and native reply. Be truthful about what actually happened.

**2:15–2:30 — Customer outcome.** Show who was protected, evidence, the recommended action, and data-privacy explanation. End with the one-liner.

## Visual staging

- **Primary screen:** Operations command center with an incident timeline on the left, relationship graph in the center, selected incident / risk evidence on the right, and event counters along the top.
- **Secondary tabs:** Customer view and a visually distinct `SIMULATED SCAMMER COLLECTOR` view.
- **Do not:** Present unfiltered synthetic submission counts as a number of real scammers defeated; show a percent confidence without calibration; claim automatic blocking of carrier messages or actual external attack disruption.

## Fallback table

| Failure | Honest demo fallback |
|---|---|
| Photon voice number/SIP unavailable | Show **SIMULATED VOICE** with a prerecorded fictional call; explicitly say the real SIP integration is incomplete |
| SIP works but webhook delayed | Show call status in provider console and link a separately marked pre-recorded call event |
| No iMessage-capable sender | Use synthetic inbox, label it; never represent Android SMS as iMessage |
| LLM unavailable | Use deterministic incident rules and canned explanation fixtures, clearly identified |
| Internet unavailable | Locally hosted app + SpacetimeDB + synthetic scenario engine; show no live provider badge |
| Network graph breaks | Fall back to incident and campaign tables subscribed to the same database |

## Judging talking points

- **T-Mobile creativity:** Builds on detection with a novel, controlled decoy research mechanism, proactive campaign correlation, clear intervention, and privacy-first design.
- **SpacetimeDB primary value:** Real-time multi-view threat-network state and decoy lifecycle are the application, not an incidental chat feature.
- **Photon primary value:** Native message/call experiences connect the protective backend to real communications; voice routing uses Photon SIP and a voice model provider.
- **Responsible impact claim:** The hackathon simulates data-contamination mechanics; proof of effectiveness against real scammers requires future authorized research.

## Closing / roadmap (mention only if asked)

Carrier-side opt-in integrations, more robust privacy-preserving cross-customer correlation, controlled honeypot partners, and rigorous decoy-detection testing are future work—not claimed features in this 12-hour prototype.
