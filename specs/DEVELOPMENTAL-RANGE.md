# DEVELOPMENTAL-RANGE.md

The measurement framework for the pilot. Read alongside EVENTS.md. Every
hands-on tool implements the phase structure and the step sequence defined
here.

## What we are measuring and why it is not gain

Fischer and Lamborn (1988) distinguish two levels within one person in one
domain. **Optimal level** is the highest level a person can produce under
high-support conditions. **Functional level** is where they normally operate
without that support. The interval between them is the **developmental range**.

The gap is large, and — this is the point for us — it resists nearly every
intervention. Across more than a dozen studies from ages 4 to 20: practice
did not reduce it at all; instructing subjects to perform at their best
failed; self-instruction training failed and if anything widened it; a
two-week interval with instructions to think about the concepts raised both
conditions roughly equally, leaving the gap the same or slightly larger. The
only manipulation that reliably narrows it is an increase in environmental
support.

Four days will not move functional level. A CT gain score is therefore the
wrong outcome, and a null on it would tell us nothing we did not already
know from theory.

**Primary outcome of this pilot: each student's developmental range for CT,
per tool.** Nobody has characterised this for computational thinking. It is
within-subject, which is why it works at n=14 — Lamborn's design and ours
are the same shape.

Corollary for the write-up: an abstraction null is a *prediction*, not a
disappointment. Say so in the introduction, not the limitations.

## The phase structure

Every hands-on tool runs **high support first, then low support**, on tasks
of comparable difficulty.

Order is fixed. Optimal must be established before the drop can be measured,
and that is how the source studies ran it.

High support is *contextual* support built into the tool — visible scaffolds,
hints, worked material left on screen. It is **not** another person helping
during the performance. Direct intervention by a facilitator is Vygotsky's
ZPD, whose ceiling sits above optimal level, and it contaminates the measure.
Facilitators do not intervene during low-support phases; when it happens,
log `facilitator_helped` and drop that phase from the range analysis.

Every event carries `supportCondition` (`high | low | na`) and every
`phase_start` carries `scaffoldsActive[]`, the explicit list of what was on.
Record the facts, not just the label.

### Per tool

| Tool | High support | Low support |
|---|---|---|
| Mosaic | counters visible, conflicts named, assist available | counters off, no assist, comparable board |
| Manifest | same | same |
| AlwaysNever | nudge, hints, visible hypothesis field, assembled preview, single-feature feedback | none of those; **same question builder**, same transcript, a different instruction of the same tier |
| Prompt Golf | both winning prompts visible during round 3 | round 4, prompts hidden |
| MonsterMaker | no split: the projector work is the scaffold, then students work alone. `supportCondition: na` throughout, rows told apart by phaseId |  |

**AlwaysNever took four attempts to get this right**, and three of them were
not manipulations at all. The palette at Levels 1–2 with free text at Level 3
confounded support with rule difficulty. Free text alone changed the task, not
the scaffolding. A jumbled list of the same forty-eight questions changed the
interface and nothing else — *"the question bank is the same questions just
listed out, how is that less support?"*

What it settled on: the **question builder and the transcript are constant**,
because they are the task; what varies is the **prompting** around it. Two
instructions of the same tier run back to back, difficulty held constant,
support the only difference. Which of the pair is supported is decided by the
participant code, so the pairing is counterbalanced across the class. Full
table in SPEC-alwaysnever.md.

**Prompt Golf** already has a support manipulation in the comparison phase.
Purcell's finding supports it: presenting the key content of a high-level
example just before the low-support task reduces the gap. Round 3 with both
prompts on screen is the optimal condition; add a round 4 on a fourth target
with the prompts hidden for the functional condition.

## Step sequences

Pass/fail yields no range. Lamborn could report a drop from step 5 to step 3
because there was an ordinal sequence with Guttman-scale properties —
subjects passed every task up to some step and failed everything beyond.

Each tool needs 4–6 ordered steps, implemented as a **pure scoring function**
over an attempt, unit-testable in isolation, emitting `stepReached`.

### Prompt Golf

1. Produces any prompt that passes the target.
2. Reduces word count on a later attempt for the same target.
3. Reuses a structural element from an earlier winning prompt on a new target.
4. Names a structural commonality between two winning prompts
   (`comparison_response` coded S).
5. Applies the named structure to a novel target unaided (low-support round).

### AlwaysNever

1. Sends probes.
2. Varies exactly one feature from the previous probe, deliberately.
3. States a hypothesis before committing.
4. Designs a probe that would *disconfirm* the current hypothesis.
5. Commits a rule that correctly predicts held-out cases.

Step 4 used to be the hard one to score automatically. Now that the question
builder is constant across conditions, every probe carries exact slot values
in both, so it is computable everywhere: a probe is disconfirming if it
revisits ground the student's standing hypothesis was formed on.
`stepScoringExact` is true throughout — no hand-coding in either condition.

Step 3 is unreachable in the low condition by construction, since the
always-visible hypothesis field is one of the withheld supports. The
two-stage commit still captures a written guess **before** any test is run, in
both conditions, so the step is reachable at commit time and the low condition
is not floored by the interface rather than by the student.

### Mosaic and Manifest

1. Makes any valid placement.
2. Completes a board with backtracking.
3. Places a forced item (live options = 1) before an unforced one.
4. Does so consistently — majority of placements are most-constrained-first.
5. States the fewest-first heuristic when asked, in the low-support phase.

### MonsterMaker

Per student on the hands-on phases; the projector cells carry no participant
code and contribute no steps.

1. Writes an instruction the machine acts on at all.
2. Writes it as numbered steps, one action per line.
3. Fixes a failure by adding the missing step.
4. Fixes a failure by putting the steps in the right order.
5. Produces a working instruction unaided.

**Steps 3 and 4 may not be a ladder.** They are two different repair
strategies, and a student who fixes by adding never demonstrates reordering.
A first pass through the rescorer already produces `[1,2,3,5]` — a
prefix-violating set — for a perfectly competent trajectory. If that is common
in the pilot, collapse them into one step ("repairs a located failure") and
record the repair type as an attribute rather than a rung. The decision waits
for data; the raw material is captured either way.

## Check Guttman scalability in the pilot

If students pass step 4 while failing step 2, the sequence is wrong and needs
reordering. Report the scalability coefficient.

This is itself a contribution: validated ordinal step sequences for CT
constructs do not currently exist, and a pilot that produces two or three of
them is worth publishing on that basis alone, independent of what the range
numbers show.

## Ceiling expectations — read before interpreting anything

Fischer's tier structure places **Single Abstractions at 10–12** and
**Abstract Mappings at 14–16**, under optimal conditions, with most skills
sitting below that in ordinary functioning.

Eighth graders at 13–14 are solid on single abstractions at optimal level.
Abstract mappings — coordinating two abstractions — are barely emerging at
the very top of the range.

Two consequences for this design:

**Prompt Golf's 30-minute expansion is above ceiling.** One prompt hitting
all three targets with the target as a variable requires coordinating the
form-naming move *and* parameterisation. That is an abstract mapping. Fischer,
Pipp and Bullock trained 9- to 15-year-olds on tasks relating two arithmetic
abstractions and they failed all or most of eight tasks; learning appeared
around 16. Keep the expansion for the students who get there, but **step 4
(naming the commonality), not the expansion, is the abstraction measure.**

**AlwaysNever's never tier is the harder one, and predictably so.** An
*always* instruction is a presence: the evidence is in every answer, so
noticing is enough. A *never* instruction is an absence, and the only way to
find it is to design a probe *for the thing that is not there* — hypothesising
a specific gap and then going to test it. That is a different and later move
than reading a pattern off the transcript.

The conditional tier that used to sit above both ("refuses only when you ask
twice") is cut. It relates a condition to a response across instances, which
is structurally an abstract mapping, and Fischer places that at 14–16 under
optimal conditions. Four instructions across two tiers gives several students
per instruction at n=14; eleven across fourteen students would have confounded
every cross-student comparison with difficulty.

Report always-tier and never-tier ranges separately. They are not the same
task, and averaging them hides the thing most worth seeing.

## Two predictions worth testing at n=14

**Optimal is more stable across domains than functional.** Fischer and
Lamborn report that optimal level shows stability not only within but across
domains, while functional level varies widely across situations. So a
student's high-support step across the six tools should look more consistent
than their low-support step. Show it as individual profiles, not a
correlation.

**The CTt should predict Day 2 more than Day 3.** The developmental web has
skills built independently along mostly separate strands. If Román-González's
block-based instrument predicts constraint-tool performance but not
language-tool performance, that is two strands — which the web predicts, and
which is the pilot's cleanest link to the spring study.

Both are descriptive at this n. Report individual data. No inferential claims.

## Reference

Fischer, K. W., & Rose, S. P. (1998). Growth cycles of brain and mind.
*Educational Leadership*, 56(3), 56–60.

Lamborn, S. D., & Fischer, K. W. (1988). Optimal and functional levels in
cognitive development: The individual's developmental range. *ISSBD
Newsletter*, 14(2), 1–4.
