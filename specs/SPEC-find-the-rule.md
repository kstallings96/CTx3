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

**Low support:** free text probes, no hypothesis field, a *different rule of
the same tier*. `scaffoldsActive: []`.

Rule difficulty held constant, support varied. High first, always.

Step sequence, emitted as `stepReached`:

1. Sends probes.
2. Varies exactly one feature from the previous probe, deliberately.
3. States a hypothesis before committing.
4. Designs a probe that would *disconfirm* the current hypothesis.
5. Commits a rule that correctly predicts held-out cases.

Step 4 is computable under the slot palette — a probe is disconfirming if its
slot values are ones the stated hypothesis predicts should behave differently.
In free text it needs hand-coding; flag those with `stepScoringExact: false`.

Note that step 3 is unavailable in the low-support phase by construction,
since the hypothesis field is gone. That is intended: the drop it produces is
part of what the range is measuring. Do not "fix" it by keeping the field.

## The probe builder — high support phase

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
