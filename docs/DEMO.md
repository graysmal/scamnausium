# Demo runbook (about 2.5 minutes)

**One-liner:** Scam filters flag one message at a time. scamnasium links every report into shared protection, and its honeypot line costs scammers the one thing they can't get back: time.

## Before you present
1. `spacetime start`, `npm run gateway`, `npm run dev`. Open http://localhost:5173 full screen (1920×1080).
2. Paste `OPERATOR_DEMO_SECRET` into **Operator key** (top left).
3. `npm run seed` for a populated starting graph, or **Reset demo data** for a clean start.
4. Gateway env for real calls: `ENABLE_ELEVENLABS_POLLING=true`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `HONEYPOT_NUMBER`. Check that the top-right **Calls** dot is filled.
5. Keep one teammate's phone ready to call the honeypot number. Don't spam it: one call for the demo, one for rehearsal.

## Script
**0:00 — The problem (Network view).** "Every scam text or call gets judged on its own. Scammers reuse the same playbook across thousands of people, and nobody connects the dots."

**0:20 — Check a message.** Click **Use sample** (PayPal email), then **Check**. (Or drop `tests/fixtures/paypal-phish.eml`: a raw email whose failed SPF/DMARC checks are flagged.) The report appears on the graph and the inspector opens: high risk, and *why* in plain language (sender pretends to be PayPal but comes from `paypa1-billing…`, replies go elsewhere, sign-in pressure). No black box, every reason is shown.

**0:45 — It's a campaign, not a message.** Click **USPS fee text**, then **USPS variant**. Different wording and links, but both join the *USPS · Delivery fee* campaign, and the shared brand node connects them. Drag nodes around and click a campaign to see its reports.

**1:05 — Live call (the honeypot).** A teammate calls the honeypot number and plays the scammer ("This is Amazon, I need the code we texted you"). A blue **Live call** node appears and the left rail counts the seconds. Our AI persona "Pat" stalls, mishears, and never finishes a number. When the caller hangs up, the call is summarized and filed into the matching campaign, and **Caller time wasted** goes up.
  *Talking point:* the agent never says it's a scam and never gives out real data. Every minute on the phone with Pat is a minute not spent on a real victim.

**1:50 — What the customer sees.** **Customer** tab: paste any message into *Check it yourself*. The verdict appears instantly and is computed in the browser, so nothing is sent. If it matches a known campaign, the card says so ("reported 3 times"). **Report to protect others** adds it to the network. One card with a clear verdict, what we noticed, and one next step. Confidence is low, medium or high, never a fake percentage. Mention that the same verdict is texted back when someone forwards a suspicious message to the iMessage line (if enabled).

**2:10 — Poisoning the well (optional).** Select a campaign, click **Run decoy session**, open **Collector**: the simulated scammer list fills up with decoys. Say clearly that this runs on our own mock collector, never against real infrastructure.

**2:25 — Close.** "One report protects the next person. One call wastes a scammer's afternoon. All of it lives in one real-time SpacetimeDB state, synced across every screen."

## If something breaks
| Problem | What to do |
|---|---|
| No live call appears | Check the **Calls** dot and `npm run gateway` logs. Use the **Amazon code call** scenario, which is clearly labeled *Simulated call*. |
| Call ends but no report | The agent may have Analysis off. The call is still filed after 2 minutes with "No summary". Turn on Analysis in ElevenLabs. |
| Database restarted | The gateway reconnects on its own within about 30 seconds. Reload the page. |
| Graph looks messy | Click **Re-arrange**, then **Fit**. |
| No internet | Everything except calls and iMessage runs locally: use the scenarios and pasted messages. |

## Honesty rules for Q&A
- Scenario data is simulated and labeled. Honeypot calls are real calls from our own phones.
- The analyzer flags warning signs, not proof about a sender.
- Decoy share is measured on our simulated collector only. Real-world impact would need authorized research.
- We store only cleaned summaries: no transcripts, phone numbers or email usernames.
