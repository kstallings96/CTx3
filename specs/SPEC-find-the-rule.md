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

## The probe builder — Level 1

Detecting whether a free-text probe varies exactly one feature from the
previous probe is not reliably automatable. So constrain the interface at
Level 1 to make it exact by construction.

Level 1 probing uses a slot palette, not a text box. Something like:

```
Ask it to [ describe | list | explain ] a [ dog | city | number | song ]
in [ one word | one sentence | a paragraph ]
```

Three slots, four options each. Changing exactly one slot is then a logged
fact rather than an inference. Students can see the assembled sentence before
sending.

Level 3 is free text. Accept that single-feature variation there will need
hand-coding on a sample.

## The rules ladder

Three levels, increasing in relational complexity.

**Level 1 — lexical.** The bot never uses the letter E. Surface-detectable,
confirmable in two or three probes, builds confidence.

**Level 2 — categorical.** The bot always works an animal into its answer.
Requires noticing a pattern across responses rather than within one.

**Level 3 — conditional.** The bot only refuses when asked the same thing
twice. This is where systematic probers separate from guessers, because it
cannot be found without deliberately repeating a probe.

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
