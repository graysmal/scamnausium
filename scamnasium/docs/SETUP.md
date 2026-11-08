# Setup you need to complete

## 1. Local app — no account needed

Follow the three-terminal instructions in README. Node 24 and SpacetimeDB CLI 2.14.1 are the tested baseline. The setup script creates an operator secret and copies the local publishing token into a private `.env`; it does not print either.

For a later online demo, create/sign into a SpacetimeDB account with `spacetime login`, choose Maincloud and publish a uniquely named database. Hosted access, publishing identity changes, gateway hosting and frontend connection settings must be configured together. Do not just expose the local gateway publicly.

## 2. Photon 2.0 — highest priority

Official guide: https://photon.codes/docs/beta/get-started/voice

1. Create/select a **2.0 Beta** project. Check sponsor credits and account entitlement before buying anything.
2. Create a project API key with `project:read` and `project:write` for the messaging walkthrough. Put the key and project ID in `PHOTON_API_KEY` and `PHOTON_PROJECT_ID` in `.env`.
3. In Voice, confirm an **SMS or dedicated messaging number with voice support** is available to the project. A shared iMessage line cannot receive phone calls.
4. Record the number and any provisioning blocker locally. Knowing whether this line is obtainable is the first milestone.

No account creation, number purchase, provider verification, or API request has been performed by this prototype.

## 3. ElevenLabs inbound voice

Follow Photon’s current ElevenLabs voice recipe from the guide above.

1. Create an ElevenLabs account and publish a conversational agent.
2. Use this role-play prompt: “You are Alex, a fictional adult participant in a consenting scam-awareness demonstration. Introduce the session as a simulation. Do not request or provide real passwords, one-time codes, financial data or personal identifiers. If asked for sensitive information, decline and explain an independent verification step.”
3. In Photon, configure the selected voice-capable line’s inbound SIP voice profile. The current guide uses `sips:sip.rtc.elevenlabs.io:5061` with TLS. If ElevenLabs supplies inbound SIP credentials, use those, not the Photon API key.
4. Import the exact Photon number as an ElevenLabs SIP trunk and assign the published agent/branch. Keep encryption and codec settings aligned with the guide.
5. Call it from a separate team-controlled phone, disclose the test to participants, verify two-way audio and clean termination.
6. Store `ELEVENLABS_AGENT_ID` locally. Retain test time and conversation ID, without real transcript contents, for integration debugging.

A working provider-console call still does not mean the application is integrated. Next implementation work: verify signed post-call webhooks, deduplicate conversation IDs, and ingest only sanitized metadata into SpacetimeDB. No webhook endpoint is exposed yet.

## 4. Optional iMessage

Official guide: https://photon.codes/docs/beta/get-started/imessage

1. Have a team member with an iPhone or Mac and an iMessage-enabled sender identity.
2. Add that exact phone/email identity to the Photon project’s iMessage setup and assign a shared line using available plan capacity.
3. Put the assigned number in `PHOTON_AGENT_HANDLE`; put the human sender in `PHOTON_TEST_SENDER` and `ALLOWED_TEST_CONTACTS` (comma-separated for multiple allowlisted contacts).
4. Initiate the conversation from Messages; shared lines cannot send an unsolicited first message.
5. Leave `ENABLE_LIVE_MESSAGING=false` until the polling worker is connected and you deliberately run the consenting test. The compiled adapter currently replies only to a plain-text `ping` and uses a stable provider idempotency key. It is not invoked automatically.

## Reply with status, not credentials

- Can you get a Photon voice-capable number, or only a shared iMessage line?
- Is your ElevenLabs agent published?
- Do you have an iPhone/Mac sender available?
- Are you running locally first, or do you need a shared hosted demo?

No LLM key, carrier access, Gmail connection, or production customer dataset is needed.
