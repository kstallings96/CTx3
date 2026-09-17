# CTx3

Three computational-thinking tools for one class session, behind one
participant code.

| Tool | Construct | Shape |
|---|---|---|
| **Find the Rule** | hypothesis testing | individual, high support |
| **Prompt Golf** | abstraction, debugging | individual, high **and** low support |
| **Two Machines** | decomposition, stochastic reasoning | whole class, projector |

Read order for anyone picking this up: [`specs/ARCHITECTURE.md`](specs/ARCHITECTURE.md)
→ [`specs/EVENTS.md`](specs/EVENTS.md) → [`specs/DEVELOPMENTAL-RANGE.md`](specs/DEVELOPMENTAL-RANGE.md)
→ the tool specs.

## Running it

```bash
npm install
npm run dev
```

It runs with no backend at all: every network call becomes a no-op, events
stay in `localStorage`, and the model half of Two Machines falls back to
pre-recorded runs that are labelled as recordings on screen. Add credentials
(see `.env.example`) to log for real.

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run rescore -- log.json --check` | recompute every derived field from a raw event log |

`?reset` on any URL clears the device for the next student. `?day=3` sets the
day; students never choose it.

## What gets measured

The primary outcome is each student's **developmental range** — the highest
step reached with support minus the highest reached without it. That needs an
ordinal step sequence per tool, and the sequences are a guess until the pilot
produces data, so two things are true by design:

- `stepReached` is computed by one pure function over a **step table**
  (`scripts/scoring.mjs`). Revising a sequence is a table edit, not a refactor.
- Every scored row carries a `scoringVersion`, and `scripts/rescore.mjs`
  recomputes every derived field from raw events alone. The live path and the
  rescore path run the same code, so a disagreement is a bug rather than drift.

That is what keeps the step sequences a non-blocking decision: capture the raw
material now, settle the ordinal later.

## Data

No names, no initials, no grade. The participant code is the only identifier
and the roster mapping codes to students lives on paper with the research team.
See [`supabase/schema.sql`](supabase/schema.sql) for the tables, the
insert-only row-level security, and starter analysis queries, and
[`DEPLOY.md`](DEPLOY.md) for Supabase, OpenRouter and Vercel setup.
