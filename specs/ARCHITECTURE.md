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
    alwaysnever/
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

## Day 2 — Word4Word, a full period

Word4Word is a 60-minute period of its own, not a warm-up. It is the only
place in the week that claims **Texas TEKS 8.1(A)** — decompose real-world
problems into structured parts using pseudocode — which is why the task has a
right answer, the failures have locations, and the instruction is numbered
imperative lines rather than prose.

| | Time | Shape |
|---|---|---|
| 1 · Cold open | 5 | Projector. Type `build a snowman`. Nothing happens. |
| 2 · Class writes v1 | 8 | Projector, class dictates. It breaks somewhere specific. Fix that one step. |
| 3 · **Your own snowman** | 20 | **Individual, own devices.** Unlimited runs. |
| 4 · **Fix a broken one** | 10 | **Individual.** An authored instruction with one wrong step. |
| 5 · The four cells | 12 | Projector. The class's vague and precise instructions, both machines, five runs each. |
| 6 · Close | 5 | The tally, and what the model filled in that nobody wrote. |

Thirty minutes hands-on, thirty on the projector. **Rows are mixed by design:**
phases 3 and 4 carry `participantCode` and are attributable; the projector
phases carry none and log at session level. Both sit at
`supportCondition: "na"` and are told apart by `phaseId` — there is no
high/low split here, because the projector work *is* the scaffold and forcing
a formal split would mean two snowmen in one period.

## Day 3

| Order | Tool | Time | Support |
|---|---|---|---|
| 1 | AlwaysNever | 28 min | **high then low** |
| 2 | Prompt Golf | 18 min | high (round 3) and low (round 4) |

46 minutes of tool time. **AlwaysNever's low-support phase is restored** —
it was cut purely for time under a schedule that no longer exists now that
Word4Word has moved to its own day. Two rules of the same tier back to back,
the palette and hypothesis field on and then off, difficulty held constant.

Prompt Golf still carries the headline range measurement. Two tools reporting
a range is better than one, and AlwaysNever's is now honest: the two-stage
commit records the hypothesis whether or not the always-visible field is
there, and step 4 is defined against the student's own prior probes rather
than slot algebra, so neither step is unreachable without the palette.

## Offline and recovery

School wifi will drop mid-session. Assume it.

- All events buffer to localStorage immediately on emit.
- A background sync flushes the buffer when the network is available.
- Buffered events survive a page reload and a tab close.
- Every tool exposes a hidden JSON export — five taps on the header — that
  downloads the full local buffer, for rescuing a device that never reached
  the network.

Tools that call a model keep a pre-recorded fallback bank and label it as a
recording on screen. Word4Word's literal half is deterministic and needs no
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
4. AlwaysNever.
5. Word4Word.
6. Retrofit `?pc=` handling into the three existing tools.

## DECIDE

- Does the hub show any progress state to the student across days, or is each
  day a clean entry? A visible streak may motivate; it may also make an absent
  student feel behind.
- Day setting: build-time constant or facilitator query param?
- Word4Word's projector cells are class-level while its hands-on phases are
  not. The tool switches between them with a control on screen. Should that
  control be facilitator-only (a query param) so a student cannot wander into
  the projector cells mid-period? Current lean: yes, once the period is
  rehearsed.

## Settled

- ~~Is Literal Genie a whole-class projector demo or a hands-on station?~~
  Both, and neither. Literal Genie alone duplicated RowdyRobo Vac's
  closed-vocabulary deterministic command language, measuring the same thing
  twice a week apart. It is merged with the five-run variance display into
  **Word4Word** (SPEC-word4word.md), where the literal executor is a control
  condition rather than an activity: determinism becomes the comparison, not
  the content.
- ~~Is Word4Word whole-class only?~~ No. Thirty of its sixty minutes are
  hands-on and attributable; the projector cells stay class-level.
- ~~Which tool carries the developmental-range measurement?~~ Prompt Golf
  leads; AlwaysNever now reports one too.
