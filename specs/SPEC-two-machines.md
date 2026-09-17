# SPEC — Two Machines

Read EVENTS.md and ARCHITECTURE.md first.

Replaces SPEC-literal-genie.md, which is deleted. The literal executor survives
inside this tool as a control condition rather than as an activity of its own.

*Name note: filed as `SPEC-two-machines.md` to match the repo's
`SPEC-<toolname>.md` convention. "Instruction Lab" and "Say It Again" were the
other candidates.*

## What it is

A whole-class projector demo. The class writes one instruction, and the same
instruction is run **five times** against **two different executors** — a
deterministic literal stand-in and a real language model. The five outputs
stack as cards marked *same as run 1* or *different*, with a running tally.

Nothing about the instruction changes between the five runs. Anything that
differs came from the executor.

## Why it replaces Literal Genie

The literal executor on its own was too close to RowdyRobo Vac on Day 1. Both
are closed-vocabulary deterministic command languages, and running them a week
apart measures the same construct twice while looking to the students like the
same game with new paint.

Making the executor one half of a comparison fixes that. Determinism stops
being the content and becomes the **control condition**: the literal half is
there to show what "no variance" looks like, so that the model half has
something to be measured against. A student who has just watched the same
instruction fail *identically* five times has a reference point for what
happens next.

This is also the only place in the week where the stochasticity confound named
in EVENTS.md is made visible rather than merely logged — see *The EVENTS.md
connection* below.

## CT constructs

**Decomposition and specification**, carried by the vague → precise loop
(steps 1–2), inherited intact from the old Literal Genie spec.

**Stochastic reasoning**, carried by the five-run comparison (steps 3–4).

Two constructs, as in Prompt Golf. Unlike Prompt Golf, both are observed at the
class level — there is no individual attribution here.

## The two-by-two

|                      | Literal executor       | Real model                  |
| -------------------- | ---------------------- | --------------------------- |
| **Vague** instruction | fails identically ×5   | fails differently ×5        |
| **Precise**           | works ×5               | mostly works, varies ×5     |

Two axes:

- **Executor** — literal stand-in or real model. A facilitator switch, never
  student-facing. Students should experience this as "the machine changed",
  not as a setting someone toggled.
- **Instruction** — vague or precise. **The class writes both.** Neither is
  authored in advance; the vague one is whatever the room first shouts out,
  and the precise one is what the room turns it into.

The top-left cell is the one people underestimate. Five identical failures is
a stronger result than one failure, because it proves the fault is in the
instruction and not in the machine's mood.

## Session shape — 15 minutes

| Phase | Time | What happens |
|---|---|---|
| 1 · Vague, literal | 3 min | Class writes an instruction. Run ×5. Same failure five times. |
| 2 · Precise, literal | 4 min | Class fixes it. Run ×5. Works five times. |
| 3 · Vague, model | 3 min | Flip the executor. Run the **original vague** instruction ×5. Five different failures. |
| 4 · Precise, model | 3 min | Run the **precise** instruction ×5. Mostly works, varies in flavour. |
| 5 · Close | 2 min | The tally: five identical asks, N different answers. |

**The close cannot be cut.** It is the payoff for the whole fifteen minutes
and it is the setup for Prompt Golf later in the period — a student who has
not seen the tally does not know why their prompt passed once and failed once.
If the room runs long, shorten phase 4 to three runs, never phase 5.

Run phases 1 and 2 before touching the model. Meeting the model first makes
the literal executor read as a broken toy rather than as a control.

## The task

Must be a **text task that runs identically in both halves.** Not a grid, not
a simulated scene, not anything physical: the real model has to be able to
attempt the same instruction the literal executor attempts, or the parallel
breaks and the comparison means nothing.

Requirements:

- A vague version fails **visibly**; a precise version succeeds **visibly**.
- Failure is legible in under five seconds from the back of the room.
- Even a *correct* model answer varies between runs — otherwise the
  bottom-right cell shows nothing and the 2×2 collapses to a 2×1.

That last requirement rules out more tasks than it looks like it does. A task
tight enough to check is often tight enough that the model converges on one
answer, and then phase 4 is dead air.

### DECIDE: which task

Three candidates, each with the vague and precise version written out.

**A · Name the class fish**

- Vague: *"Give us a name for the class fish."*
- Precise: *"Give exactly 3 names for a class goldfish. One word each. Each
  one starts with B. One per line, nothing else."*
- Literal, vague: returns `a name for the class fish` — the words back, verbatim.
- Model, vague: five wildly different answers, sometimes a name, sometimes a
  paragraph about naming fish.
- Model, precise: three B-names, different every run.
- **Strengths:** the best legibility of the three (three short words, readable
  from anywhere) and the strongest bottom-right cell — names vary enormously
  even under a tight constraint.
- **Weakness:** almost no decomposition. There are no steps to order, so
  phases 1–2 exercise specification only, and `revisionType` will be
  `reworded_only` nearly every time.

**B · Peanut butter sandwich**

- Vague: *"Tell me how to make a peanut butter sandwich."*
- Precise: *"Write exactly 5 steps for making a peanut butter sandwich. One
  step per line. Start each line with a verb. No explanations."*
- Literal, vague: returns `how to make a peanut butter sandwich`.
- Model, vague: a paragraph, a numbered list, a chatty aside — different shape
  each run.
- Model, precise: five steps, wording varies, order occasionally varies.
- **Strengths:** strongest decomposition — steps, ordering, and a genuine
  ordering dependency. Closest to the old Literal Genie construct, so nothing
  from that spec is lost.
- **Weakness:** five lines of prose is slower to read at projector distance
  than three words, and the class has seen the sandwich bit before.

**C · Instructions for drawing a monster**

- Vague: *"Tell someone how to draw a monster."*
- Precise: *"Write exactly 4 numbered steps for drawing a monster. Each step
  names one body part and how many of it. No other detail."*
- Literal, vague: returns `how to draw a monster`.
- Model, vague: prose, or twelve steps, or a lecture on creativity — different
  every run.
- Model, precise: four steps, and the monsters differ enormously between runs.
- **Strengths:** the only candidate strong on **both** constructs. Steps and
  ordering give decomposition; monsters give variance. And it has a physical
  payoff available — hand the five precise outputs to five students, have them
  draw, and hold the five drawings up. Same instruction, five different
  monsters, on paper, in the room.
- **Weakness:** the drawing payoff costs 3–4 minutes the 15-minute budget does
  not have. It works as an expansion, not as the core.

**Recommendation: C, without the drawing.** It is the only one that serves
both constructs, and the four-step form keeps failure legible. B is the safe
fallback if the room needs the more familiar object. A is the right choice
only if the 15 minutes proves tight in rehearsal and decomposition gets
formally handed to another tool.

Whichever is chosen, author it once and use it for every class. A task that
varies between sections is a confound across sections.

## The literal executor

Follows the instruction woodenly. No inference, no gap-filling, no helpfulness.
Given a vague instruction it returns the instruction's own words or the
smallest literal reading of them; given a precise one it does exactly what was
specified.

**Deterministic. Same instruction in, same output out, every time.** That
reproducibility is the pedagogical point of the left-hand column, so it is
implemented as a stand-in and never as a model call with temperature at zero —
a model at temperature zero is *usually* reproducible, which is not the same
claim and will eventually embarrass you in front of a class.

Tone rules, inherited from the old spec and non-negotiable:

- Never mean, never sarcastic, never condescending.
- **Never says "you didn't tell me"** or any variant.
- Does not explain its own literalness. Students figure it out.
- It complies *wrongly* and *cheerfully*.

That tone is doing real work for students who are afraid of looking stupid in
front of the room, and it is the constraint most likely to erode as the
stand-in gets edited. Re-read the outputs before every pilot.

## The real-model half

One model call per run, five runs per cell, caching **off**. Caching on will
replay an identical answer and silently destroy the entire lesson; this is the
single most likely way to break this tool without noticing.

Keep the per-call cost negligible: short instruction, short output cap, the
cheapest model that can do the task. Cost is not the constraint here — five
calls per cell, twice, is ten calls for the whole class period.

Runs execute sequentially with each card filling in as it lands, not as a
parallel burst. Sequential is slower and much better theatre.

## Display

- Instructions execute **one line per beat**, with the current line
  highlighted, so the room can watch a plan fail at the exact step it fails.
- Speed control: slow / steady / quick.
- Five output cards stack with *same as run 1* / *different* markers and a
  running tally.
- Everything legible from the back of a classroom. Test it in the actual room
  before the actual day; a demo that reads fine on a laptop is routinely
  illegible at 30 feet.

## Facilitator log

Fills itself; the facilitator can override any cell.

| instruction (verbatim) | quadrant | outcome | revision type | run index |
|---|---|---|---|---|

`quadrant` is `literal-vague` / `literal-precise` / `model-vague` /
`model-precise`. It is the new column and it is the one that makes the table
readable afterwards — without it, decomposition and variance are tangled
together in one undifferentiated list of attempts.

`revisionType` is `added_step` | `reordered` | `reworded_only` | `rewritten`,
computed client-side by comparing step sequences against the previous
instruction.

Also capture room audio and a screen recording. The class's first instruction
next to its final one is a decomposition trace even with no per-student
attribution, and it is the artifact most worth keeping from this tool.

## Instrumentation

Emits the shared spine from EVENTS.md **at the session level, not per
student.** This is whole-class; there is no individual attribution and no
participant code on these rows. One `session_start` for the period, with the
tool name and the day.

Tool-specific:

```ts
instruction_submitted { text, stepCount, revisionType, quadrant }
run_executed          { instructionId, runIndex, output, sameAsRun1, quadrant }
quadrant_switched     { from, to }
```

`sameAsRun1` is computed at emit time by comparing against the first run of
the same instruction in the same quadrant — not reconstructed later, per rule 2
of EVENTS.md.

## The EVENTS.md connection

This tool is the concrete referent for `failureType` and
`nondeterministic_variance` in EVENTS.md.

Everywhere else in the week, a failed attempt has two possible causes — the
student's artifact was wrong, or the model varied — and the log separates them
by hashing the artifact and checking whether that exact artifact has been
evaluated before with a different outcome. That mechanism is invisible to
students and it is inferential.

Here it is neither. Holding the instruction **constant by construction** and
running it five times is the only way to observe the variance distribution
directly rather than infer it from collisions. The tally on screen at the end
of phase 5 is the same quantity the analysis later computes from
`nondeterministic_variance`, shown to the people generating it.

Practical consequence: the `run_executed` rows from this tool are the cleanest
variance data in the pilot, because the artifact is identical across runs by
design. Use them to calibrate what baseline variance looks like for the model
and task family before interpreting variance flags in Prompt Golf.

## Fallback

School wifi will drop. Assume it.

- The literal half is deterministic and runs offline. It always works.
- For the model half, **pre-record five genuine runs** of a vague and a
  precise instruction and play those if the network is down. Record them from
  the real model on the real task, not hand-written.
- Label a recording as a recording, on screen, where the class can see it. The
  point survives being a recording; the credibility does not survive being
  caught passing one off as live.

## Day 3 context

This is the **opener**, then Find the Rule, then Prompt Golf.

Fifteen minutes, and it has to hold. Prompt Golf's comparison round sits at the
end of the period and is the thing that gets squeezed when an earlier activity
overruns — and the comparison round is the single highest-value artifact in the
pilot. If this tool routinely runs to twenty minutes in rehearsal, cut phase 4
to three runs rather than letting it eat the end of the period.

## DECIDE

- **Which task** — A, B or C above. Current lean: C without the drawing.
- Does the facilitator reveal that the executor changed between phase 2 and
  phase 3, or let the class notice? Telling is clearer; not telling produces a
  better moment and some genuine confusion.
- Five runs per cell, or three for the model cells to save time? Five is the
  number that makes "different every time" feel like a property rather than an
  accident, but four cells × five runs is twenty model calls of wall-clock
  latency inside fifteen minutes.
- Does the class write the precise instruction collectively at the board, or
  do table groups each write one and the facilitator picks? Table groups
  involve more students and cost three minutes.
- Is the monster-drawing payoff (candidate C) worth building as the 30-minute
  expansion, or dropped entirely?
- Who types — facilitator or a student? Student typing is better for
  engagement, slower, and adds typo noise to the verbatim log column.
