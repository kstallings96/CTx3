# SPEC — Word4Word

Read ARCHITECTURE.md, EVENTS.md and DEVELOPMENTAL-RANGE.md first.

Replaces SPEC-literal-genie.md, which is deleted, and supersedes the
"Two Machines" draft this file grew out of. **Day 2, a full 60-minute period.**

## What it is

Students write pseudocode to build a snowman. A machine executes it **word for
word**, one line per beat, and the scene renders as it goes — so a plan breaks
visibly, at the exact step it breaks.

Then the same instruction is run five times against two different machines: the
literal one, which does only what the line says, and a real language model,
which quietly fills in whatever you left out.

## Why it exists here

This is the only place in the week that claims **Texas TEKS 8.1(A)** —
*decompose real-world problems into structured parts using pseudocode*.

That claim is what fixes the task's shape. A snowman is a real-world procedure
with genuine ordering dependencies, so the instruction has a **right outcome**
and the failures have **locations**. An earlier draft used "draw a monster",
which was legible but had no wrong answer: a vague monster prompt and a precise
one both produce monsters, the vague/precise axis went mushy, and nothing in
the week owned 8.1(A).

The literal machine is also a control condition rather than an activity of its
own. On its own it duplicated RowdyRobo Vac's closed-vocabulary command
language, measuring the same construct twice a week apart. Paired with a real
model it becomes the thing that makes "different" mean something: five
identical results next to five different ones.

## The vocabulary

Three verbs. Everything else gets a cheerful no-op. The palette is **visible**
to students — discovering a vocabulary is Find the Rule's job, on the next day,
and hiding it here would confound decomposition with vocabulary search.

| Line | Effect | Fails when |
|---|---|---|
| `ROLL a <big\|medium\|small> ball` | a ball appears on the ground | no size given → a default ball, which is itself the failure |
| `STACK the <size> ball on the <size> ball` | lifts one onto another | either ball has not been rolled |
| `ADD <face\|arms\|hat\|buttons\|scarf> to the <size> ball` | attaches a feature | that ball is not in the stack yet |

**Target:** big on the ground, medium on big, small on medium, face on the
small ball, arms on the medium one.

**Free decoration:** hat, buttons and scarf are not checked. That is deliberate
— it gives a real model somewhere harmless to vary, so five snowmen that all
match the target while wearing different hats read as *variance* rather than as
five degrees of wrong.

The two balls in a `STACK` line are read in **sentence order**, not size order.
"the medium on the big" puts medium on top. Reading them by size would silently
invert every correct instruction a student writes.

## Failures have locations

| Mistake | What renders |
|---|---|
| `ROLL` missing | the `STACK` line lifts nothing — a gap in the tower |
| `STACK` reversed | small ball at the bottom, big one on top |
| `ADD` before stacking | carrot nose floating with nothing under it |
| `ADD` to an unrolled ball | feature hanging in mid-air |
| face on the big ball | face down at the bottom, arms up top |
| no `STACK` at all | three balls in a row on the ground |

The ordering case is the one this task exists to produce. Decorating before
stacking leaves a **correct tower with a floating face** — one failure, one
cause, one line to point at.

## Vague and precise, worked

**Vague** — what a class writes first:

```
1. Roll three balls
2. Stack them up
3. Add a face
```

*Literal machine:* three identical balls on the ground (it was told three, and
told ball, and never told size); line 2 does nothing, because "them" is not a
ball it knows; line 3 puts a face in mid-air. Three located failures, the same
five times.

*Real model:* a correct snowman — because it supplied the sizes, the stacking
order and the target of the face. **Three things nobody said.**

**Precise:**

```
1. ROLL a big ball
2. ROLL a medium ball
3. ROLL a small ball
4. STACK the medium ball on the big ball
5. STACK the small ball on the medium ball
6. ADD a face to the small ball
7. ADD arms to the medium ball
```

*Literal:* the target scene, five times identical. *Real model:* matches too,
five times, differing only in decoration.

## Make the inference visible

Each model output is diffed against what the class's instruction actually
specified, and the card is badged with the difference: *"filled in 3: what size
each ball is; what goes on what; which ball the face goes on."*

This is the difference between the two machines made concrete, and it is the
single best argument for keeping the literal column. On a precise instruction
the badge reads zero, which is the point.

## Session shape — 60 minutes

| | Time | Shape |
|---|---|---|
| 1 · Cold open | 5 | Projector. Type `build a snowman`. Nothing happens. |
| 2 · Class writes v1 | 8 | Projector, class dictates. It breaks. Fix that one step. Run again. |
| 3 · **Your own snowman** | 20 | **Individual, own devices.** Unlimited runs. |
| 4 · **Fix a broken one** | 10 | **Individual.** An authored instruction with one wrong step. |
| 5 · The four cells | 12 | Projector. Vague and precise, both machines, five runs each. |
| 6 · Close | 5 | The tally, and the inference badges side by side. |

Thirty minutes hands-on, thirty on the projector. A full hour of whole-class
demo would be too much of one thing; the projector phases exist to teach the
loop and then to pay it off.

Steps 1–2 are the decomposition loop inherited from the old Literal Genie spec.
Step 5 is the variance demo. **Step 6 is the payoff and the setup for Prompt
Golf** — do not cut it for time.

## The four cells

|                      | Literal machine        | Real model                  |
| -------------------- | ---------------------- | --------------------------- |
| **Vague** instruction | fails identically ×5   | fills in the gaps, differently ×5 |
| **Precise**           | builds it ×5           | builds it ×5, varies in decoration |

Executor is a facilitator switch, never student-facing. Both instructions are
written by the class.

## Instrumentation

**Rows are mixed by design.** Hands-on phases carry `participantCode` and are
attributable; projector phases pass `participantCode: null` and log at session
level. Both sit at `supportCondition: "na"` and are told apart by `phaseId`
(`w4w-solo` versus `w4w-class`). There is no high/low split — the projector
work *is* the scaffold, and forcing a formal split would mean two snowmen in
one period.

```ts
instruction_submitted { text, stepCount, numbered, revisionType, quadrant }
walkthrough_step      { stepIndex, line, effect, quadrant }
instruction_executed  { matched, mismatch[], failurePoint, quadrant }
run_executed          { instructionId, runIndex, output, sameAsRun1,
                        matched, inferredCount, quadrant }
quadrant_switched     { from, to }
facilitator_judgement { quadrant, outcome }
```

`matched` is the checker; the facilitator log keeps a human **Outcome** column
beside it, because the tool knows whether the scene matches and the room knows
whether that was what they wanted.

`numbered` is recorded on every submission. The 8.1(A) claim is about
pseudocode, so whether the student actually wrote numbered imperative lines is
a fact worth having rather than an assumption.

## Step sequence

Scored on the hands-on phases only.

1. Writes an instruction the machine acts on at all.
2. Writes it as numbered steps, one action per line.
3. Fixes a failure by adding the missing step.
4. Fixes a failure by putting the steps in the right order.
5. Produces a working instruction unaided.

**Steps 3 and 4 may not be a ladder** — see DEVELOPMENTAL-RANGE.md. They are
alternative repair strategies, and a student who repairs by adding never
demonstrates reordering. A first pass through `scripts/rescore.mjs` already
yields `[1,2,3,5]` for a perfectly competent trajectory. If that is common in
the pilot, collapse them into one step and record the repair type as an
attribute. The raw material is captured either way, which is what makes the
decision safe to defer.

## Fallback

School wifi will drop. Assume it.

- The literal half is deterministic and needs no network at all.
- The model half plays five **pre-recorded genuine runs**, labelled as
  recordings on every card.
- The recordings are snowman-specific. If the class goes off-task *and* the
  network is down, the tape will not match what they asked — the literal half
  stays honest, the model half needs the network or a re-recorded tape.

## DECIDE

- Should the solo/projector switch be facilitator-only (a query param) so a
  student cannot wander into the projector cells mid-period?
- Phase 4 needs three or four authored broken instructions, each with exactly
  one wrong step and a known fault line. Who writes them, and do they cover
  add / reorder / wrong-target evenly?
- Does the class's own v1 from phase 2 carry into phase 5 as the vague
  instruction, or does the facilitator retype a canonical one so every section
  compares the same thing?
- Is there a target scene beyond the snowman for fast finishers, or do they
  decorate?
