# Architecture — CT Tools pilot

**Canonical.** Supersedes every earlier copy. Read order for anyone (human or
Claude Code) picking this repo up: ARCHITECTURE → EVENTS → DEVELOPMENTAL-RANGE
→ tool specs.

One deployment. One hub. Three tools built in-repo, three existing tools
linked out.

## Why one deployment

The participant code is the reason. Six tools across four days means six
chances for a student to mistype a code or a facilitator to skip the step,
and every miss is a row that can't be joined to the rest of that student's
week. Entering the code once at the hub and passing it down removes five of
those chances.

Secondary benefits: one shared events module that cannot drift between
tools, one database and one export, one URL on the whiteboard.

## Repo shape

```
/src
  /shared
    events.ts         emit(), buffer, sync, derived fields
    participant.ts    code capture, validation, persistence
    schema.ts         event type definitions — single source of truth
    steps.ts          the step-definition TABLE, one entry per tool
    scoring.ts        pure scoring function over a replayed attempt
    replay.ts         event log -> derived fields, used live AND by rescore
    ui/               shared primitives only
  /hub
    Hub.tsx           tile grid, day gating
  /tools
    prompt-golf/
    find-the-rule/
    two-machines/
/scripts
  rescore.mjs         recompute every derived field from a raw event log
/supabase
  migrations/
```

Every tool route is lazy-loaded. A build error or runtime crash in one tool
must not take down the hub or the other tools.

Tools import from `/shared`. Tools never import from each other. Nothing in
`/shared` imports from a tool.

**`steps.ts` is a table, not code.** Step definitions live in one place as
data so that changing a sequence after the pilot is a table edit rather than
a refactor across three tools. `scoring.ts` reads the table and nothing else;
it never contains a tool-specific branch.

## Scoring and rescoring

`stepReached` is the primary outcome's input, so it gets more care than
anything else in the repo.

- Every scored event carries `scoringVersion`. When a step definition changes,
  the version changes, and old rows stay interpretable.
- `scoring.ts` is a **pure function** over a replayed attempt. No DOM, no
  tool state, no clock. Unit-testable in isolation, and it is the only place
  a step can be decided.
- `replay.ts` rebuilds derived fields from raw events alone. The live tools
  call it incrementally; `scripts/rescore.mjs` calls it over an exported log.
  **Both paths run the same code**, so a live value and a rescored value
  disagreeing is a bug that shows up rather than a silent drift.

EVENTS.md rule 2 still holds — derived fields are computed at emit time and
stored. The rescorer does not replace that; it exists so the stored values can
be recomputed and checked, and so a step sequence can be revised after the
pilot without the logged data becoming useless. That is what makes the step
sequences a non-blocking decision: capture the raw inputs now, decide the
ordinal later.

Practical consequence for every tool: **capture the raw material a candidate
step might need, whether or not the current table uses it.** Probe text and
slot values always, timings between attempts, hypothesis text at every stage,
comparison responses verbatim. Storage is cheap; a pilot you cannot rescore is
not.

## Hub

Single screen, no chrome. Large tiles, one per tool, sized for a touchscreen.

- First visit: prompt for participant code. Validate against format (see
  below), persist to localStorage, write a `session_start` row.
- Subsequent visits: code already present, go straight to tiles.
- A small muted text control resets the code, for shared devices. Not
  prominent — a student should not hit it by accident.
- Tiles are gated by day. Only the current day's tools are enabled; others
  render visibly present but inert. The day is set by a build-time constant
  or a query param the facilitator uses, never by student choice.

Tiles for existing tools (RowdyRobo Vac, Mosaic, Manifest) are external
links carrying `?pc=<participantCode>`. Those tools need a small retrofit to
read `pc` from the URL and write it into their own session rows. Their logs
stay in their own tables; the join happens at analysis time on the code.

## Participant codes

Assigned on Day 1, printed on a card the student keeps.

Format: three letters plus two digits, e.g. `KTQ47`. Avoid characters that
get confused on a card or a touchscreen keyboard — no O/0, I/1, or 5/S. Codes
are validated on entry against the known roster list; an unknown code shows a
gentle retry rather than proceeding, since a typo'd code silently creates an
orphan participant.

No names. No initials. No grade. The roster mapping codes to students lives
outside this system, on paper, held by the research team.

## Day 3 — the one schedule that does not fit itself

Day 3 carries three tools and the specs had declared more things uncuttable
than the period holds. Settled:

| Order | Tool | Time | Support |
|---|---|---|---|
| 1 | Two Machines | 15 min | `na` — whole class, no attribution |
| 2 | Find the Rule | 14 min | **high only** |
| 3 | Prompt Golf | 18 min | high (round 3) **and** low (round 4) |

47 minutes of tool time, leaving room for three transitions.

**Find the Rule loses its low-support phase.** Running two full phases needs
~29 minutes and the period does not have them. Prompt Golf carries the range
measurement instead: it has the better-behaved step sequence, and abstraction
is the construct the study cares most about. Find the Rule contributes
hypothesis-testing process data at optimal level only, and every event it
emits still carries `supportCondition: "high"` so the rows stay joinable.

One tool measuring range properly beats two measuring it badly. The second
Find the Rule phase goes to the spring study, where it has room — and by then
the step sequence will have been revised against real pilot data rather than
guessed at.

## Offline and recovery

School wifi will drop mid-session. Assume it.

- All events buffer to localStorage immediately on emit.
- A background sync flushes the buffer when the network is available.
- Buffered events survive a page reload and a tab close.
- Every tool exposes a hidden JSON export — five taps on the header — that
  downloads the full local buffer, for rescuing a device that never reached
  the network.

Tools that call a model keep a pre-recorded fallback bank and label it as a
recording on screen. Two Machines' literal half is deterministic and needs no
network at all.

## Stack

Vite + React + TypeScript, Supabase for persistence, Vercel for hosting.
Match whatever Manifest already uses so there's one thing to maintain.

A model-calling tool needs a server-side proxy — the API key cannot ship in
the client bundle. One serverless function, key in a non-`VITE_` env var,
rate-limited per participant code.

## Build order

1. Shared events module and participant capture, plus `steps.ts`,
   `scoring.ts`, `replay.ts` and `scripts/rescore.mjs`. Nothing else works
   without these and everything depends on their shape. The rescorer is built
   here, not later — its existence is what makes the step tables revisable.
2. Hub with tiles and day gating.
3. Prompt Golf — the most instrumented tool, the one carrying two constructs,
   and now the one carrying the range measurement. Building it first shakes
   out the events module and the scoring module together.
4. Find the Rule.
5. Two Machines.
6. Retrofit `?pc=` handling into the three existing tools.

## DECIDE

- Does the hub show any progress state to the student across days, or is each
  day a clean entry? A visible streak may motivate; it may also make an absent
  student feel behind.
- Day setting: build-time constant or facilitator query param?
- Two Machines is whole-class with no participant attribution. Does the hub
  still route students into it individually on their own devices, or does the
  facilitator open it once on the projector and students never touch that
  tile? Current lean: projector only, tile hidden from the student hub.

## Settled

- ~~Is Literal Genie a whole-class projector demo or a hands-on station?~~
  Both, and neither. Literal Genie alone duplicated RowdyRobo Vac's
  closed-vocabulary deterministic command language, measuring the same thing
  twice a week apart. It is merged with the five-run variance display into
  **Two Machines** (SPEC-two-machines.md), where the literal executor is a
  control condition rather than an activity: determinism becomes the
  comparison, not the content. Projector demo, one device.
- ~~Which tool carries the developmental-range measurement on Day 3?~~
  Prompt Golf, via rounds 3 and 4. See the Day 3 table above.
