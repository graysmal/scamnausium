---
name: slopdocs
description: Use before writing a plan, bug write-up or feature doc for other agents.
---

# slopdocs

Your planning docs, bug investigations, and feature write-ups are the most valuable artifacts you produce. The code is the cheap part. Without these docs, the next agent starts from zero and re-derives the same constraints and re-litigates the same trade-offs every time.

This skill defines where documentation lives and when it should be created. It is a filing system, not a writing process. Produce the content however fits the task (a planning, design or debugging skill, your harness's plan mode, or no process at all), then use slopdocs to decide where it goes.

## Audience: other agents, not humans

Slopdocs are notes from one agent to the next. Dense, ugly, accurate. They preserve context that would otherwise get re-derived from scratch on every session.

A project may also have human-facing documentation — typically in `docs/`, `README.md`, a wiki, or a docs site. That has different goals (onboarding, public reference, marketing) and different prose conventions. Slopdocs do not replace it and should not be filed there. Likewise, do not write slopdocs into `docs/` or other human-facing locations.

If the user asks for "docs" without specifying which kind, ask. Agent-facing slopdocs and human-facing docs live in different places and read very differently — getting it wrong wastes the work. A quick clarifying question avoids producing the wrong artifact.

## The convention

Documentation lives in `slopdocs/` at the project root with three subdirectories:

```
slopdocs/
├── features/
│   └── <feature>.md
├── bugs/
│   └── YYYYMMDD-<short-slug>.md
└── plans/
    └── YYYYMMDD-<feature>.md
```

### `slopdocs/features/<feature>.md`

One living doc per feature. Describes how the feature works today: data models, key logic, design decisions. Update it when the feature changes.

### `slopdocs/bugs/YYYYMMDD-<short-slug>.md`

One file per bug investigation, date-prefixed. The fix lives in the commit history. The doc preserves the context: the rabbit holes, the red herrings, the root cause analysis. That context is what saves the next agent from repeating the same investigation.

### `slopdocs/plans/YYYYMMDD-<feature>.md`

One file per planning session, date-prefixed. Write the plan before writing code. Keep it after shipping. Reading the original plan is the fastest way to understand a feature later.

Features get one living document. Bugs and plans are point-in-time snapshots. The date prefix keeps things chronological and prevents naming collisions.

## When to write a slopdoc

- You spent significant time thinking about it, or there was a genuine architectural fork in the road.
- A bug had a non-obvious root cause that someone will probably hit again.
- You're building a new feature. Save the plan you already generated.
- A decision is going to look weird in three months and someone will be tempted to "refactor" it away.

## When to skip

- The diff is the documentation. Renames, reformats, dependency bumps.
- The change is trivial and easy to revert.
- Writing the doc would take longer than writing the code.
- You'd be repeating something already in another slopdoc. Link to it instead.

## How to write one

These are notes from one engineer to another. Keep it dense. State the decision first, then the reasoning. Document the alternatives you tried and why they failed. A messy list of bullet points is fine. Accurate and ugly beats polished and outdated.

Do not write status updates or summaries for humans to skim. Write context that the next agent can read and act on immediately.

## Before making changes

Read the relevant slopdocs before modifying any feature with existing documentation. Check `slopdocs/features/` for living docs and `slopdocs/plans/` for historical context on the area you're working in.

## Working with other skills and plan modes

Slopdocs is the filing system. Whatever produced the content, save it to the slopdocs path instead of wherever that process would normally put it.

**Design specs** (from a brainstorming or design skill):
- Save the spec to `slopdocs/features/<feature>.md`, not `docs/superpowers/specs/` or similar. This becomes the living feature doc. Update it as the feature evolves.

**Implementation plans** (from a planning skill, or a harness plan mode that writes to a scratch location):
- Save the plan to `slopdocs/plans/YYYYMMDD-<feature>.md`, not `docs/superpowers/plans/`, `docs/plans/`, `.sisyphus/plans/` or a session-scoped scratch file.
- Keep the plan after shipping. It's the fastest way to understand the feature later.

**Bug investigations** (from a debugging skill or an ad-hoc investigation):
- When the investigation is worth preserving (non-obvious root cause, multiple rabbit holes, something someone will hit again), save the write-up to `slopdocs/bugs/YYYYMMDD-<short-slug>.md`.

**No other process:**
- Write the doc yourself following "How to write one" above, and put it in the right folder.
