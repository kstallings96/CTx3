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
| Find the Rule | slot palette + visible hypothesis field | free text, no hypothesis field |
| Prompt Golf | both winning prompts visible during round 3 | round 4, prompts hidden |
| Instruction Lab | whole-class; `supportCondition: na` | — |

**Find the Rule needs a specific fix.** The current spec puts the slot palette
at Levels 1–2 and free text at Level 3, which confounds support with rule
difficulty — a failure at Level 3 could be the harder rule or the missing
scaffold, and there is no way to tell. Decouple them: use **two rules of the
same tier**, one run with the palette and hypothesis field, one without.
Rule difficulty held constant, support varied.

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

### Find the Rule

1. Sends probes.
2. Varies exactly one feature from the previous probe, deliberately.
3. States a hypothesis before committing.
4. Designs a probe that would *disconfirm* the current hypothesis.
5. Commits a rule that correctly predicts held-out cases.

Step 4 is the hard one to score automatically. With the slot palette it is
computable: a probe is disconfirming if its slot values are ones the stated
hypothesis predicts should behave differently. In free text it needs
hand-coding — flag those attempts as `stepScoringExact: false`.

### Mosaic and Manifest

1. Makes any valid placement.
2. Completes a board with backtracking.
3. Places a forced item (live options = 1) before an unforced one.
4. Does so consistently — majority of placements are most-constrained-first.
5. States the fewest-first heuristic when asked, in the low-support phase.

### Instruction Lab

Class-level, not per student. No step sequence. `supportCondition: na`.

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

**Find the Rule's conditional tier is a ceiling item.** "Refuses only when you
ask twice" relates a condition to a response across instances — structurally a
mapping. Predict most students fail it unsupported. That is a known ceiling,
not a broken task, and it belongs in the high-support phase if used at all.

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
