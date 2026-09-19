# SPEC — Find the Rule

Read EVENTS.md and ARCHITECTURE.md first. This tool emits the shared spine
plus the tool-specific events at the bottom of this file.

## What it is

A chat partner operates under one hidden constraint. Students probe it with a
limited number of messages, then commit to a written guess. The system tests
their stated rule against three held-out cases and shows whether it predicts
the bot's actual behaviour.

## CT construct

Hypothesis testing and controlled variation. One construct. Do not add
features that chase abstraction or debugging — other tools carry those.

## Session shape — 15 minutes

| Phase | Time | What happens |
|---|---|---|
| Demo | 30s | Scripted exchange where the bot behaves visibly oddly. Not interactive. |
| Probing | 8 min | Student sends probes, capped at 12. Counter visible. |
| Commit | 3 min | Write the rule in plain words. |
| Test | 2 min | The stated rule runs against three held-out cases. |
| Close | 1 min | Score shown, 0–3. |

The 12-probe cap is the mechanism. Unlimited probing produces chatter;
scarcity produces deliberate queries, which is the behaviour being measured.

## Support phases — see DEVELOPMENTAL-RANGE.md

**This replaces the previous level/scaffold arrangement, which was
confounded.** The old spec put the slot palette at Levels 1–2 and free text at
Level 3, varying support and rule difficulty together — a failure at Level 3
could be the harder rule or the missing scaffold, with no way to tell.

Instead: **two rules of the same tier**, run back to back.

**High support:** slot palette for probe construction, hypothesis field
visible. `scaffoldsActive: ["slotPalette","hypothesisField"]`.

**Low support:** the same forty-eight questions as a **jumbled list**, no
question builder, no hypothesis field, a *different rule of the same tier*.
`scaffoldsActive: []`.

### What is and is not a support

This took three tries, and the first two were not manipulations at all.

**A free-text box** invited students to treat the partner as a real chatbot.
A pilot student asked *"how tall are you"* and got a canned non-sequitur:
that is a partner that looks broken, not a weaker scaffold.

**A jumbled list of the same forty-eight questions** was no better. The
structure is written out in every sentence — *"What's the [adj] [noun]?
Answer [length]"* — so a student reading three of them has the dimensions
anyway. It swapped a radio-button interface for a list interface and changed
nothing about the thinking.

**The question builder is now identical in both conditions.** It is part of
the task, not a support, and holding it constant removes an interface
confound and keeps single-feature detection exact everywhere.

What varies is the **prompting** — the things that scaffold the reasoning
without making the puzzle itself easier:

| | High | Low |
|---|---|---|
| Question builder | yes | **yes** — constant |
| Transcript | yes | **yes** — constant |
| "Read its answers closely…" nudge | yes | no |
| Hints, and "just tell me the rule" | yes | no |
| Somewhere to write a hypothesis | yes | no |
| Assembled-question preview | yes | no |
| "2 pills changed since your last one" | yes | no |

The transcript stays in both on purpose. Hiding it would load working
memory, which makes the task *harder* rather than *less supported*, and
confounding difficulty with support is the exact mistake this section exists
to prevent.

> **Three of these were leaking.** The nudge, the hints and the reveal were
> rendered in both conditions while `phase_start` recorded
> `scaffoldsActive: []` for the low one. The design said one thing and the
> log said another, and nothing was comparing them. `auditScaffolds()` in
> `src/app.js` now walks the declared list against the DOM on every render
> in dev and warns on any mismatch in either direction.

Rule difficulty held constant, support varied. High first, always.

Step sequence, emitted as `stepReached`:

1. Sends probes.
2. Varies exactly one feature from the previous probe, deliberately.
3. States a hypothesis before committing.
4. Designs a probe that would *disconfirm* the current hypothesis.
5. Commits a rule that correctly predicts held-out cases.

Step 4 is computable from slot values — a probe is disconfirming if its slot
values are ones the stated hypothesis predicts should behave differently.
Both conditions carry exact slot values, so it needs no hand-coding in
either and `stepScoringExact` is true throughout.

Note that step 3 is unavailable in the low-support phase by construction,
since the hypothesis field is gone. That is intended: the drop it produces is
part of what the range is measuring. Do not "fix" it by keeping the field.

## The probe builder — high support phase

Detecting whether a free-text probe varies exactly one feature from the
previous one is not reliably automatable. Both conditions therefore choose
from a fixed question space; what differs is whether the space is presented
already decomposed.

High support uses a slot palette:

```
Ask it to [ describe | list | explain ] a [ dog | city | number | song ]
in [ one word | one sentence | a paragraph ]
```

Three slots, four and four and three options. Changing exactly one slot is a
logged fact rather than an inference, and the assembled sentence is visible
before sending.

Low support draws from the same 4 x 4 x 3 space, but as complete sentences
in a scrolling list, shuffled, with no preview and no "you changed one
thing" feedback. Questions already asked are marked and remain clickable — a
repeat is data, not an error.

## The rules ladder

Three tiers, increasing in relational complexity. **Each student gets two
rules from the same tier** — one in each support phase.

**Lexical.** Never uses the letter E. Exactly seven words. Never says "the".
Surface-detectable, confirmable in two or three probes, builds confidence.

**Categorical.** Always works an animal in. Always includes exactly one
number. Requires noticing a pattern across responses rather than within one.

**Conditional.** Refuses when asked the same thing twice. Contradicts your
last message. **This tier is a ceiling item** — relating a condition to a
response across instances is structurally an abstract mapping, which Fischer
places at 14–16 under optimal conditions. Predict most 13-year-olds fail it
unsupported. Use it in the high-support phase or not at all, and do not treat
failure there as a finding about the student.

Cut the rule bank to **four rules total** for the pilot — two lexical, two
categorical — so that with n=14 you get several students per rule and can say
something about how strategy varies at fixed difficulty. Eleven rules across
fourteen students confounds every cross-student comparison with rule
difficulty. Keep the rest banked for spring.

Author each rule as a system prompt plus a deterministic post-check, so the
bot cannot accidentally violate its own rule. If the model output violates
the constraint, regenerate rather than ship it — an inconsistent rule
destroys the activity.

## The hypothesis field

An optional "I think it's…" text field, always visible during probing,
editable at any time. Every save is logged.

This is the most important design element in the tool. It converts internal
state into data and it makes committing-before-testing observable. A student
who writes three successive hypotheses is doing something visibly different
from one who writes nothing until the commit screen.

Do not make it required. Requiring it changes the behaviour being measured.

## Meta-queries

Students will ask the bot what its rule is. Handle it by level:

- Levels 1 and 2: the bot deflects naturally, staying in character.
- Level 3: the bot refuses explicitly — "I can't tell you that, but you can
  keep testing."

Log every meta-query. It is a strategy choice, not noise, and it is worth
reporting what proportion of students try it and when.

## Held-out cases

Three per rule, authored alongside it. Each case is an input the student never
sent during probing. The system applies the student's stated rule to predict
the bot's behaviour, runs the bot, and shows both side by side.

Scoring the student's natural-language rule against a case requires a judge.
Use a second model call with a tight rubric and a deterministic fallback:
if the judge is uncertain, mark it unscored rather than guessing, and flag
those for hand-scoring.

## Expansion — 30 minutes

Students author a rule for a partner to find, then watch the partner probe it.
Authoring a testable constraint is a different cognitive act from finding one.

Log the authored rule and whether the partner found it.

## Tool-specific events

```ts
probe_sent         { text, probeIndex, slotValues?, msSincePrevious }
hypothesis_noted   { text, afterProbeIndex, revisionIndex }
meta_query_flagged { probeIndex }
rule_committed     { text, probesUsed }
prediction_tested  { caseId, predicted, actual, match, judgeConfident }
```

Map onto the spine: `probe_sent` is also an `attempt_submitted` with the probe
as `artifact`. `rule_committed` is `task_complete`.

## Outcomes

Primary: predictive accuracy of the committed rule, 0–3.

Secondary: probes before first hypothesis; hypothesis revision count;
proportion of single-feature probes at Level 1; meta-query rate.

## DECIDE

- Does a student who solves Level 1 fast advance to Level 2, or does everyone
  see the same level? Advancement is better pedagogy and worse for
  comparability. Current lean: everyone gets Levels 1 and 3, Level 2 is
  optional overflow for fast finishers.
- What happens at 12 probes with no hypothesis written? Forced commit, or a
  nudge at probe 9?
- Is the demo the same bot the student then probes, or a different one?


## The order is not the student's to choose

`FTR_SEQUENCE` in `src/rules.js` is the whole progression and the tool walks
it on its own:

| | Rule | Support |
|---|---|---|
| 1 | never uses the letter E | with help |
| 2 | never uses a word longer than four letters | on your own |
| 3 | always includes exactly one number | with help |
| 4 | always works a colour into its answer | on your own |

Two lexical rules, then two categorical ones, each pair run with support and
then without. Difficulty is held constant within a pair and support is the
only thing that varies — which is the entire basis of the developmental-range
measure. A student who picked their own order would be comparing two numbers
that do not mean the same thing, and fourteen students who each picked would
give fourteen incomparable trajectories.

There is no rule chooser in the interface. The only control is **Next**.

## `npm run check:rules`

The rule has to be true of **every** reply the partner can produce. If one
reply in forty breaks it, the student doing the task properly — reading
closely, hunting a counterexample — is the one who gets it wrong.

"Every" is four rules x forty-eight question combinations x three or four
interchangeable frames, plus the held-out cases and the inferred-pill path. No
hand-check covers that, and one did not: `short_words` shipped with frames
containing "course", "every" and "wrong", and **twenty-five of fifty-eight
replies broke the very rule they were meant to demonstrate**.

The check enforces three things, and `npm run demo` will not publish without
it passing:

1. **The rule holds** for every reply, from every route into the generator.
2. **No stock phrase** accounts for more than a third of a rule's replies —
   if every answer ends "— a solid 10", students name the tail instead of the
   rule. (This is how that bug was caught the first time, by hand.)
3. **The judge reads what students write**, including the phrasings the
   interface's own starter chips invite. It refused "It always has a number"
   while offering "It always…" as a chip, which is broken twice over.

It also checks that no two rules in the set are satisfied by the same
answers — the test that would have caught `no_the`, which was undiscoverable
next to `no_e` because "the" contains an E.


## What a first student test changed

Three things, all found by watching one thirteen-year-old use it.

### The judge tests the student's claim, not the rule

It used to ask only "does this text describe the rule I am running?" and
answer *unscored, flagged for a human* to anything else — including **"it
always says a food"**, which is clear, testable, and simply wrong. A student
who reasons their way to a wrong answer and is told the machine cannot read
their handwriting learns nothing.

`CLAIMS` in `src/rules.js` is a list of things a student might assert, each
with how they phrase it and how to check it against a reply. Committing runs
the matched claim against the three held-out replies and reports per case.
"It always says a food" now comes back **1/3**, showing the two replies that
were a dog and a basketball player. `casesMatched` — what step 5 scores — is
true only when the claim holds all three times, so a confident wrong answer
scores as one.

### A question it cannot answer gets a redirect, not a non-sequitur

Asked "how tall are you", the partner replied *"Chihuahua, and that is my red
line."* It only has opinions about four nouns, and anything else fell through
to a hashed pick — which reads as a broken machine rather than a character
with one interest.

Each rule now carries an `offTopic` opener, written to satisfy its own rule,
prepended when the question names nothing it knows: *"I just rank top ones.
Chow, easy."* `npm run check:rules` verifies the opener plus every possible
reply still obeys the rule, because a careless word there breaks the puzzle
exactly as a careless word in a frame does.

### The rule box is not a chat box

A student typed a reply to BIT into the rule field. Both boxes were the same
shape, sat under the same conversation, and only a small label told them
apart — and after three turns of chat, a box below a chat is a box you talk
in.

The notes and commit fields are now paper: warm fill, dashed edge, no blue.
The label sits on the field and says **"BIT cannot see this"**, and the
commit screen says plainly not to write back. Blue is for talking to
something; paper is for writing for yourself.

