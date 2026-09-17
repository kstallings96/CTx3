# SPEC — Prompt Golf

Read EVENTS.md and ARCHITECTURE.md first.

This is the most instrumented tool in the pilot and the only one carrying two
constructs. Build it first — it will shake out the shared events module
properly.

## What it is

Hit a specified output using as few words as possible. Score is word count,
lower wins. Opens with a round fixing someone else's broken prompt.

## CT constructs

**Abstraction**, via minimality pressure. **Debugging**, via the clinic round.
Both are instrumented; see the outcomes section for which signal serves which.

## Session shape — 15 minutes

| Phase | Time | What happens |
|---|---|---|
| Clinic | 90s | A broken prompt and its wrong output. Student fixes it. |
| Round 1 | 3 min | One concrete target, unlimited attempts. Everyone succeeds. |
| Round 2 | 4 min | Second target, same family. |
| Comparison | 2 min | Their two winning prompts side by side. One question. |
| Round 3 | 3 min | Third target, using whatever they noticed. |
| Close | 1 min | Word counts across all three shown as a single line. |

The comparison phase is load-bearing. If the session runs long, cut Round 3,
never the comparison — sequential exposure to two solved cases does not
produce principle extraction; side-by-side comparison does.

## Broken Prompt Clinic

Three authored broken prompts, each shipped with:

- the prompt text
- the wrong output it produced (pre-generated, not live)
- an annotated **fault span** — the character range actually responsible

The fault span is what makes `targetedEdit` exact rather than inferred. This
is the only place in the pilot where that is true, so it is where the clean
debugging data lives.

Fault types to cover across the three: an ambiguous pronoun, a missing
constraint, and a contradictory instruction.

Lowest authorship burden of anything in the week. It exists partly so that
students who freeze at a blank text box have already succeeded once before
Round 1.

## Targets

Checkable by string match or a cheap deterministic function. Never by
judgement.

Examples:
- five foods, alphabetical order
- a sentence where every word starts with the same letter
- a list of three things, each exactly two words

Sub-second feedback matters more than target sophistication. If a checker
needs a model call, the target is wrong.

All three targets must come from one family so that a shared structure
actually exists to be found. If the three targets have nothing in common,
the comparison phase asks a question with no answer.

## Scoring and display

Word count, shown live as the student types. A running best for each target.

Do not show a class leaderboard during the session. RowdyRobo found the
leaderboard became a channel for peer strategy transmission — interesting, but
here it would contaminate the individual abstraction measure. Show a class
board at the end only.

Terse gibberish that passes is a legitimate strategy, not a bug. Let it score.
It will appear in the data and it is worth reporting.

## The comparison phase

Both winning prompts rendered side by side, equal visual weight, no
annotation. One question:

> What do these two have in common?

Free text, required, no character minimum. This response is the single
highest-value artifact in the pilot. The coding scheme is in EVENTS.md and
must exist before the pilot runs.

Then Round 3 begins with both prompts still visible.

## Expansion — 30 minutes

One prompt that hits all three targets, where the target is supplied as a
variable the student writes a placeholder for. This is the generalization test
and the only place across the three tools where real abstraction should be
expected to show.

## Tool-specific events

```ts
clinic_fix_submitted { brokenPromptId, editedText, editDistance,
                       targetedEdit, targetedEditExact: true }
prompt_submitted     { text, wordCount, targetId, attemptIndex }
prompt_evaluated     { pass, checkerOutput, failureType }
comparison_shown     { promptIdA, promptIdB }
comparison_response  { text }
transfer_attempt     { text, wordCount, targetsPassed }
```

`failureType` must distinguish `target_not_met` from
`nondeterministic_variance` — see the stochasticity section of EVENTS.md.
Hash each submitted prompt; if an identical prompt previously passed and now
fails, that is variance, not a student error, and the distinction is the
thing that lets the analysis separate the two.

## Outcomes

**Abstraction.** Word count trajectory across attempts within a target — a
descending count is responding to minimality pressure, an ascending count is
patching, and the two populations separate visibly when plotted per student.
Plus `comparison_response` coded S/F/R/N. Plus transfer round success.

**Debugging.** `targetedEdit` on the clinic round (exact).
`msFromFailureToNextAttempt` — the pause that separates reading the output
from reflexively resubmitting. `consecutiveFailures` before abandonment.

## DECIDE

- Is there an attempt cap per target, or only a time cap? A cap makes attempts
  comparable across students; no cap is truer to the activity.
- Does Round 3's target get revealed before or after the comparison question?
  After is cleaner — otherwise students answer the comparison question
  instrumentally.
- Live model or pre-generated response bank for the guided rounds? Bank is
  wifi-proof and deterministic; live is honest. Current lean: bank for the
  clinic, live for Rounds 1–3, with a bank fallback on network failure.
