# SPEC — Word4Word

Read ARCHITECTURE.md, EVENTS.md and DEVELOPMENTAL-RANGE.md first.

Replaces SPEC-literal-genie.md, which is deleted. **Day 2, a full 60-minute
period.**

## What it is

Students draw monsters. Then the class tries to make two machines reproduce
one of them — a real drawing, hanging on the wall — and watches what each
machine does with the gaps.

## Why the target is a real drawing

This is the design decision everything else follows from, and it took three
tries to get right.

**"Build a snowman"** had a right answer, but the answer was general
knowledge. A model that has never seen your class still knows a snowman is
three stacked balls, so it succeeded by knowing rather than by being told —
and the vague/precise axis went soft.

**"Draw a knight"** had the same problem plus a worse one: five parts in a
fixed arrangement before it looked like anything, which made it a puzzle
about the mascot instead of a lesson about instructions.

**"Draw a monster"** was rejected earlier for having no wrong answer, and
that was correct as far as it went. What fixes it is not changing the subject
but changing where the answer lives. **The class reproduces one student's
actual monster, on the document camera.** Now:

- there is a right answer, and it is hanging on the wall;
- failure has a location — that monster has three eyes and this one has two;
- **the target is arbitrary**, so no amount of knowing what monsters are
  generally like helps. When the model supplies a tail nobody asked for, the
  room can see it guessing, because guessing is the only thing it could have
  been doing.

That last property is what a snowman could never have. It is the difference
between a model that is *right* and a model that is *lucky*, made visible.

## Why it exists here

This is the only place in the week that claims **Texas TEKS 8.1(A)** —
*decompose real-world problems into structured parts using pseudocode*.

The literal machine is a control condition, not an activity. On its own it
duplicated RowdyRobo Vac's closed-vocabulary command language, measuring the
same construct twice in a week. Paired with a real model it becomes the thing
that makes "different" mean something: five identical results beside five
different ones.

## The vocabulary

**No palette.** Students type what they mean. An earlier build offered eight
tappable commands, which turned "decompose the problem" into "pick from a
list" and handed over the vocabulary that finding the vocabulary was the work.

One rule runs the engine: **every part has an anchor, the part it hangs off.**
Name a part before its anchor exists and it floats, visibly, with nothing to
attach to. That is the whole ordering lesson in one mechanism.

| Anchor | Parts |
|---|---|
| — | body |
| body, or the head if there is no body | head, arms, legs, tail, wings, spots, stripes, spikes |
| head | eyes, mouth, nose, ears, horns, antennae |
| mouth | teeth |

**A head can stand on its own.** The first version demanded a body before
anything else, which is the machine's prejudice rather than a fact about
instructions — ask a person or a model how to draw a monster and they start
with the head. Insisting otherwise turned a perfectly good set of steps into
a grey blob with every other part floating, which looks exactly like the
machine ignoring what it was told. A head with arms is a real monster.

The lesson still bites where it should: **eyes need a head, teeth need a
mouth**, and anything at all before the first structural part floats. What
cannot be drawn on nothing still cannot be drawn on nothing.

**And it draws what you said.** Colour (eleven of them), size (tiny, small,
big, huge), shape for the body and head (round, square, tall, wide) and
number are all read and all rendered. A line can name more than one part —
"add a mouth with five teeth" is one thing a student writes and two things to
draw.

Unstated things get a **deliberately dull default**: a medium grey round
blob. Not a pretty default, not a guessed one. Vagueness has to *look* vague
next to the drawing on the wall.

Plurals are read literally. "Add spots" is not a request for one spot, so a
plural word with no number gets the part's natural plural and a singular word
gets one.

## Failures have locations

| Mistake | What renders |
|---|---|
| eyes before head | eyes hanging beside an empty space, labelled |
| teeth before mouth | the same |
| `add an eye` | one eye, because one is what you said |
| no colour given | grey, conspicuously |
| verb it knows, part it does not | "Okay!", and nothing changes |

### What is NOT a mistake

Three things that look like the machine misbehaving and are not, each fixed
after watching a real model output fail on them:

- **A location phrase is not an instruction.** "On each side of the head, add
  two small round ears" is one instruction with a location in front of it.
  Reading the location as a second instruction drew a fresh blank head and
  wiped the green one from the step before.
- **Mentioning a part again does not blank it.** "Draw a big green head" then
  "below the eye, draw a mouth" must not turn the head grey.
- **One sentence may name the whole monster.** A class types "a big green
  head, one big eye, four arms and one big foot" on one line; all four parts
  are drawn.
- **A verb is not required.** "green head" and "one big eye" are how people
  write a list of parts. Demanding draw/add/make threw away every line that
  did not happen to have one, and the machine sat saying "Okay!" while a
  perfectly clear instruction scrolled past. Naming a part IS the
  instruction; chatter needs no special case, because "Sure, here you go!"
  names no part and does nothing.

## Session shape — 60 minutes

| | Time | Shape |
|---|---|---|
| 1 · **Draw your monster** | 6 | **Paper.** Everyone draws. No rules. |
| 2 · **Describe, don't show** | 10 | **Paper, in pairs.** Swap. Describe your partner's monster while they redraw it from your words alone. Compare the two pages. |
| 3 · Pick one | 3 | One monster goes under the document camera and stays on screen all period. |
| 4 · Class writes v1 | 8 | Projector, class dictates. Run it on the literal machine. It is not the monster on the wall. Fix one thing. Run again. |
| 5 · The four cells | 14 | Projector. Vague and precise, both machines, five runs each. |
| 6 · **Your own monster** | 13 | **Individual, own devices.** Write the steps for the one you drew. Scored. |
| 7 · Close | 6 | The tally, and the inference badges side by side. |

Phase 2 is the whole lesson in miniature and unplugged — a student who has
watched a partner draw the wrong monster from their own description already
knows what the period is about. It produces no events, which is fine.

**Phase 7 is the payoff and the setup for Prompt Golf** — do not cut it. If
something must go, take time from phase 4.

> **If you cut phase 6, Word4Word contributes no per-student data at all** and
> the developmental-range measure rests on Find the Rule and Prompt Golf
> alone. That may be the right call for a 60-minute period — but it is a
> decision to make deliberately, not one to discover afterwards.

## The four cells

|                       | Literal machine      | Real model                        |
| --------------------- | -------------------- | --------------------------------- |
| **Vague** instruction | one monster, ×5      | five different monsters           |
| **Precise**           | the same monster ×5  | close, varying in what it adds    |

Both instructions are written by the class. Executor is a facilitator switch,
never student-facing.

Two counts are shown and the gap between them is the point. **Different
answers** is how many distinct texts came back. **Different monsters** is how
many distinct drawings those texts produced. Five differently-worded answers
that draw the same monster are variation that does not matter; two that draw
different monsters are variation that does.

Each model card is badged with what it filled in that nobody said — *"filled
in 5: which parts (head, eyes, mouth, arms); how many of things there are;
what colour it is; what goes on what; that it should be numbered steps at
all."* Against an arbitrary target, every one of those is a guess.

## Keeping it classroom-safe

A projector in front of thirteen-year-olds is not a place for "the model
almost always behaves". Two layers, and the second one fails closed.

1. **The prompt** constrains the model to numbered build steps, the fixed
   part vocabulary, at most eight steps, and states the audience. Instructions
   go in the user turn rather than a system message, because the artifact
   build reaches Claude through the `sample` capability, which has no system
   role — one prompt shape for both backends means the safety framing is not
   something only one of them gets.
2. **The guard** (`checkSafe`) runs on every model output *before it is
   displayed or drawn*, and on the class's own instruction before it is sent
   to the model — the fastest way to get a model to say something is to ask
   it to, and that box is typed by a room of thirteen-year-olds with an
   audience. A blocked instruction shows the facilitator why and sends
   nothing. The literal machine is unaffected: it can be given anything,
   because it only ever draws parts it knows.
   It rejects anything that is not shaped like build steps, anything over a
   length cap, and anything matching a word list. A rejected run renders as a
   card reading *"that run was held back"* with no text shown, and is logged
   as `run_withheld`.

A withheld run costs the lesson nothing. The claim being made is that runs
differ, and a withheld run is still a run that differed.

## Instrumentation

**Rows are mixed by design.** Phase 6 carries a participant pseudonym and is
attributable; projector phases pass `participantCode: null`. Both sit at
`supportCondition: "na"` and are told apart by `phaseId` (`w4w-solo` versus
`w4w-class`). No high/low split — the projector work *is* the scaffold.

```ts
instruction_submitted { text, stepCount, numbered, revisionType, quadrant }
walkthrough_step      { stepIndex, line, effect, quadrant }
instruction_executed  { graded: false, partsPlaced[], partsFloating[],
                        usedCounts, usedPlacement, usedColour, usedSize,
                        failurePoint, quadrant }
run_executed          { instructionId, runIndex, output, sameAsRun1,
                        inferredCount, quadrant }
run_withheld          { instructionId, runIndex, reason, quadrant }
instruction_blocked   { reason, quadrant }
quadrant_switched     { from, to }
facilitator_judgement { quadrant, outcome }
```

`matched` is always `null` and `graded` always `false`. Nothing here is
marked by the machine, because the answer key is a piece of paper. Anything
reading these has to handle that rather than treating null as failure.

## Step sequence

Scored on phase 6 only.

1. Writes an instruction the machine acts on at all.
2. Writes it as numbered steps, one action per line.
3. Orders the steps so every part has something to attach to.
4. Builds something with at least four distinct parts.
5. Says how many, or says where — not just which part.

**This is a chain, and each step strictly contains the one before it.**

The previous sequence scored *"repairs by adding a step"* as 3 and *"repairs
by reordering"* as 4. Those are alternative repairs, not successive
achievements, and a rescore showed the consequence: a student who got it right
first time scored **2**, below one who had to fix a mistake. The scale was
rewarding failure-then-recovery and calling it competence.

Repair behaviour is still on every attempt as `revisionType` and deserves its
own analysis. It is not an ordinal step, because it is not on the same axis.

## Fallback

School wifi will drop. Assume it.

- The literal half is deterministic and needs no network.
- The model half plays five **pre-recorded genuine runs**, labelled as
  recordings on every card, and every recording passes the safety guard.
- The paper phases need nothing and cannot fail.
- The status pill names the actual reason the model is missing — no key, no
  endpoint, or `npm run dev` rather than `npx vercel dev` — instead of saying
  only "offline".

## DECIDE

- Phase 6 versus time: see the warning above. Keep it, or accept that
  Word4Word is a whole-class demonstration with no individual measure.
- Phase 3: does the facilitator pick the monster, or does the class vote? A
  vote costs two minutes and buys investment.
- Does the class's v1 from phase 4 carry into phase 5 as the vague
  instruction, or does the facilitator retype a canonical one so every section
  compares the same thing?
- Step 5 counts "said how many **or** said where" as one step. If nearly every
  student reaches it, split them — but only with pilot data.
- The safety word list is deliberately blunt and will occasionally hold back
  a harmless run. Is that the right trade for your room? It is one array in
  `src/w4w.js`.
