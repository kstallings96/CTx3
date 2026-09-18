# SPEC — Word4Word

Read ARCHITECTURE.md, EVENTS.md and DEVELOPMENTAL-RANGE.md first.

Replaces SPEC-literal-genie.md, which is deleted, and supersedes the
"Two Machines" draft this file grew out of. **Day 2, a full 60-minute period.**

## What it is

Two halves, two subjects, one machine.

**The hands-on half.** Students draw a monster on paper, swap with a partner,
and describe aloud how to build it. Then each student writes pseudocode for
**their own** monster. A machine executes it word for word, one line per beat,
and the drawing builds as it goes — so a plan breaks visibly, at the exact
step it breaks.

**The projector half.** One instruction — *draw the school mascot* — run five
times against two machines: the literal one, which does only what the line
says, and a real language model, which quietly fills in whatever was left out.

## Why it exists here

This is the only place in the week that claims **Texas TEKS 8.1(A)** —
*decompose real-world problems into structured parts using pseudocode*.

### Why two subjects, and why the monster came back

An earlier draft of this spec rejected "draw a monster" on the grounds that it
has no wrong answer: a vague monster prompt and a precise one both produce
monsters, so the vague/precise axis goes mushy and nothing owns 8.1(A). That
objection was **right about the projector half and wrong about the hands-on
half**, and splitting the subjects is what resolves it.

- On the **projector**, vague-versus-precise has to bite, so the subject needs
  a right outcome the whole room can judge together. The mascot has one: a
  helmet goes on the body, a plume goes on the helmet, and getting that wrong
  is visible from the back row. This is where the 8.1(A) claim lives.
- On the **hands-on** half, the missing ground truth is now supplied by the
  student's own paper. There is a right answer — *their* monster — it simply
  is not one a checker can hold. So the checker does not try. What gets scored
  is the **structure of the instruction**, which is what decomposition means,
  rather than agreement with a picture nobody chose.

The warm-up is doing real work here, not decoration. A student describing a
partner's monster aloud has already discovered that "draw a scary one" does
not survive the trip to another person's pencil. The screen then makes that
discovery repeatable and recordable.

### Why the literal machine

It is a control condition, not an activity. On its own it duplicated
RowdyRobo Vac's closed-vocabulary command language, measuring the same
construct twice in a week. Paired with a real model it becomes the thing that
makes "different" mean something: five identical results next to five
different ones.

## The vocabulary

**No palette.** Students type what they mean. An earlier build offered eight
tappable commands, which turned "decompose the problem" into "pick from a
list" and handed over the vocabulary that finding the vocabulary was the work.
Discovering a *hidden* vocabulary is Find the Rule's job on the next day; this
is neither hidden nor given.

One rule runs the whole engine: **every part has an anchor, the part it hangs
off.** Name a part before its anchor exists and it floats, visibly, with
nothing to attach to. That is the entire lesson about ordering.

| | Parts | Anchor |
|---|---|---|
| **Knight** (projector) | body | — |
| | helmet, shield, sword, legs | body |
| | plume | helmet |
| **Monster** (hands-on) | body | — |
| | head, arms, legs, tail, wings, spots | body |
| | eyes, mouth, horns | head |

Verbs are read loosely — `draw`, `make`, `add`, `give`, `put`, `place`,
`attach`, `build` all work — because the exercise is about *what you say to
do*, not about guessing a verb. Anything with no recognisable part gets a flat
"Okay!" and changes nothing.

Countable parts take a number, in digits or words: *add three eyes*, *give it
6 legs*. An explicit `on the <part>` overrides the default anchor, which is
how a student says where something goes rather than relying on the machine's
assumption.

**Knight target:** a body, a helmet on the body, a plume on the helmet, a
shield and a sword on the body. Legs are free — not checked. That is
deliberate: it gives a real model somewhere harmless to vary, so five knights
that all match while some have legs read as *variance* rather than as five
degrees of wrong.

**Monster target:** none. See above.

## Failures have locations

| Mistake | What renders |
|---|---|
| plume before helmet | plume in the air, labelled, with nothing under it |
| no body at all | every part floats; nothing is attached to anything |
| eyes before head | eyes hanging beside an empty space |
| `add eyes` with no count | one eye, because one is what you said |
| verb the machine knows, part it does not | "Okay!", and nothing changes |

The ordering case is the one this task exists to produce. Naming a part before
the thing it attaches to leaves **one failure, one cause, one line to point
at.**

## Vague and precise, worked

**Vague** — what a class writes first:

```
draw a knight
```

*Literal machine:* a body, and nothing else. It was told "knight", which it
knows as a body, and never told about a helmet, a plume, a shield or a sword.
One located failure, identical five times out of five.

*Real model:* a correct knight — because it supplied the parts, the order and
what goes on what. **Three things nobody said.**

**Precise:**

```
1. DRAW a body
2. ADD a helmet to the body
3. ADD a plume to the helmet
4. ADD a shield to the body
5. ADD a sword to the body
```

*Literal:* the target, five times identical. *Real model:* matches too, five
times, differing only in whether it adds legs and in what order it does the
middle steps.

**Ask the model for "a knight", never "the Kingsborough mascot".** It does not
know your school and will invent one, and then the room cannot tell a model
that *varies* from a model that is *making it up* — which is the distinction
the whole day rests on.

## Make the inference visible

Each model output is diffed against what the class's instruction actually
specified, and the card is badged with the difference: *"filled in 2: which
parts to draw (helmet, plume, shield); what goes on what."*

This is the difference between the two machines made concrete, and it is the
single best argument for keeping the literal column. On a precise instruction
the badge reads zero, which is the point.

## Session shape — 60 minutes

| | Time | Shape |
|---|---|---|
| 1 · **Draw your monster** | 6 | **Paper.** Everyone draws. No rules. |
| 2 · **Describe your partner's** | 6 | **Paper, in pairs.** Swap. Describe how to build theirs, out loud, to the facilitator. |
| 3 · Cold open | 4 | Projector. Type `draw a knight`. A body appears. That is all. |
| 4 · Class writes v1 | 8 | Projector, class dictates the fix. It breaks. Fix one step. Run again. |
| 5 · **Your own monster** | 18 | **Individual, own devices.** Unlimited runs, scored. |
| 6 · The four cells | 12 | Projector. Vague and precise, both machines, five runs each. |
| 7 · Close | 6 | The tally, and the inference badges side by side. |

Twelve minutes on paper, eighteen hands-on, thirty on the projector. Phases
1–2 are unplugged and produce no events; that is fine, they exist to give
phase 5 a target only the student can see.

**Phase 7 is the payoff and the setup for Prompt Golf** — do not cut it for
time. If something has to go, take four minutes off phase 4.

## The four cells

|                       | Literal machine      | Real model                       |
| --------------------- | -------------------- | -------------------------------- |
| **Vague** instruction | fails identically ×5 | fills in the gaps, differently ×5 |
| **Precise**           | draws it ×5          | draws it ×5, varies in extras     |

Executor is a facilitator switch, never student-facing. Both instructions are
written by the class.

## Instrumentation

**Rows are mixed by design.** The hands-on phase carries a participant
pseudonym and is attributable; projector phases pass `participantCode: null`
and log at session level. Both sit at `supportCondition: "na"` and are told
apart by `phaseId` (`w4w-solo` versus `w4w-class`). There is no high/low split
— the projector work *is* the scaffold, and forcing a formal split would mean
two builds in one period.

```ts
instruction_submitted { text, stepCount, numbered, revisionType, quadrant }
walkthrough_step      { stepIndex, line, effect, quadrant }
instruction_executed  { matched, graded, mismatch[], partsPlaced[],
                        partsFloating[], usedCounts, usedPlacement,
                        failurePoint, quadrant }
run_executed          { instructionId, runIndex, output, sameAsRun1,
                        matched, inferredCount, quadrant }
quadrant_switched     { from, to }
facilitator_judgement { quadrant, outcome }
```

`matched` is `null` and `graded` is `false` on the monster, because there is
nothing to be right about. Anything reading these has to handle that rather
than treating null as failure. `partsPlaced` and `partsFloating` are the
observations that replace it.

`numbered` is recorded on every submission. The 8.1(A) claim is about
pseudocode, so whether the student actually wrote numbered imperative lines is
a fact worth having rather than an assumption.

## Step sequence

Scored on the hands-on phase only.

1. Writes an instruction the machine acts on at all.
2. Writes it as numbered steps, one action per line.
3. Orders the steps so every part has something to attach to.
4. Builds something with at least four distinct parts.
5. Says how many, or says where — not just which part.

**This is a chain, and each step strictly contains the one before it.** That
matters, and it is a correction rather than a refinement.

The previous sequence scored *"repairs by adding a step"* as 3 and *"repairs
by reordering"* as 4, with *"produces a working instruction"* as 5. Those are
not successive achievements — they are alternative repairs — and a rescore of
realistic trajectories showed the consequence plainly:

| Trajectory | Old steps | Old score |
|---|---|---|
| floats, then adds the missing step | `[1,2,3,5]` | 3 |
| floats, then reorders | `[1,2,4,5]` | 2 |
| **gets it right first time** | `[1,2,5]` | **2** |

A student who never made a mistake scored below one who did, because the scale
required failing in order to climb it. The scale was measuring
failure-then-recovery and calling it competence.

The sequence above is monotone by construction, so the Guttman assumption is
true rather than hoped for. Every trajectory tested comes back prefix-clean.

**Repair behaviour did not disappear.** `revisionType` is on every attempt and
deserves its own analysis — which repair students reach for, and whether that
changes across the week, is a genuinely interesting question. It just is not
an ordinal step, because it is not on the same axis as the rest.

## Fallback

School wifi will drop. Assume it.

- The literal half is deterministic and needs no network at all.
- The model half plays five **pre-recorded genuine runs**, labelled as
  recordings on every card.
- The recordings are knight-specific. If the class goes off-task *and* the
  network is down, the tape will not match what they asked — the literal half
  stays honest, the model half needs the network or a re-recorded tape.
- The paper phases need nothing and cannot fail.

## DECIDE

- Should the solo/projector switch be facilitator-only (a query param) so a
  student cannot wander into the projector cells mid-period?
- Phase 2 has partners describing a monster **to the facilitator**. With
  fourteen students that is seven descriptions in six minutes. Does it need a
  capture sheet, or is it enough that they have said it out loud once?
- Does the class's own v1 from phase 4 carry into phase 6 as the vague
  instruction, or does the facilitator retype a canonical one so every section
  compares the same thing?
- Step 5 counts "said how many **or** said where" as one step. If nearly every
  student reaches it, splitting them is the obvious refinement — but only with
  pilot data, and the raw fields are captured either way.
- Fast finishers on phase 5: a second monster, or the mascot for themselves?
