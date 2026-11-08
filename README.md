# scamnausium

**Real-time collective scam defense, inspired by AdNauseam.**

> **Hackathon starter specification — implementation not yet present.** Do not describe the planned integrations as working until they have been implemented and verified.

Scamnausium explores an unconventional way to defend people against scams. Beyond detecting suspicious messages and calls, it correlates campaigns across a shared threat network, provides understandable customer-facing protection, and runs **authorized synthetic decoy scenarios** against a **first-party mock scam collector**. The demo illustrates how coherent decoy information could make a simulated attacker dataset less useful, without submitting traffic to real scammers.

## Sponsor tracks

- **T-Mobile:** Prevention and guidance before, during, and after a scam; privacy, honesty, and creative protection beyond a classifier.
- **SpacetimeDB:** The real-time source of truth for incidents, campaigns, decoy events, interventions, and synchronized interfaces.
- **Photon 2.0:** Native communications integrations, emphasizing a live inbound voice call, plus iMessage reports and replies when available.

## Intended demo

1. Inject a synthetic phishing message and watch the incident appear.
2. Show evidence-based analysis and suggested customer actions.
3. Submit a variant of the same campaign; the live relationship graph connects them.
4. Start a **controlled** decoy scenario and watch the mock collector's decoy share rise.
5. Make an actual team-owned phone call into a Photon voice-capable number connected over SIP to an AI voice agent; show call metadata or a post-call webhook in the incident feed.
6. Show a real Photon iMessage round trip if a permitted iMessage sender and line are available.
7. Finish in the customer view: clear actions, uncertainty, and privacy disclosures.

## Planned stack

React + Vite + Tailwind · TypeScript · SpacetimeDB 2.0 · Node.js/Express gateway · Photon 2.0 API · optional ElevenLabs voice agent and LLM analysis.

## Setup (to be completed as code lands)

Prerequisites: Node.js 22+, SpacetimeDB CLI, and optionally a Photon 2.0 project with eligible messaging/voice resources.

Start by following the [official SpacetimeDB React quickstart](https://spacetimedb.com/docs/quickstarts/react/) (`spacetime dev --template react-ts`) in this repository. It should generate `spacetimedb/src/`, `src/`, and the client bindings. Agents must then populate these files and document the verified commands below.

**Verified setup commands:** _Not yet available; this repository contains planning files only._

**Local demo mode:** Must eventually run without Photon/ElevenLabs/LLM keys, using synthetic scenarios. Real provider integrations must be visibly labeled and opt-in.

**Configuration:** Agents should create `.env.example` with placeholders once they scaffold the gateway. Never commit real `.env` files or access tokens. For likely variables, see `docs/INTEGRATIONS.md`.

## Project documentation

- [`AGENTS.md`](AGENTS.md) — authoritative coding-agent requirements, boundaries, architecture, and completion criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data ownership, flows, and schema
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — Photon voice/iMessage and SpacetimeDB integration notes
- [`docs/TASKS.md`](docs/TASKS.md) — twelve-hour implementation plan and acceptance gates
- [`docs/DEMO.md`](docs/DEMO.md) — scripted pitch, test scenarios, and honest fallbacks

## Safety and scope

The project uses **synthetic data and authorized test systems only**. No mass contact, proxy evasion, third-party phishing traffic, unsolicited calling, or ingestion of real private communications. The attacker-facing UI is a labeled simulation. This is a research/prototype concept, not a proven reduction in real-world fraud.

## Status

- [x] Project specification and agent instructions
- [ ] App scaffold and first SpacetimeDB reducer
- [ ] Multi-view realtime demo
- [ ] Controlled decoy engine
- [ ] Photon inbound voice verification
- [ ] Photon iMessage verification
- [ ] Recorded end-to-end demo and pitch
