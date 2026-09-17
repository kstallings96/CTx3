# EVENTS.md — shared instrumentation

This file is the single source of truth for what every tool logs. If a tool
needs an event that isn't here, add it here first and say why.

The purpose of a shared schema is a research question, not tidiness: RQ3 asks
which CT skills are visible in which data channel. That question is
unanswerable if each tool describes student behaviour in its own vocabulary.

## Rules

1. Same student intent, same event name, across all tools. A tap in Mosaic, a
   block placement in RowdyRobo, and a prompt submission in Prompt Golf are
   all `attempt_submitted`.
2. Derived fields are computed at emit time on the client, never
   reconstructed later from a log dump. Post-hoc reconstruction fails
   precisely on the cases that matter.
3. Timestamps are UTC ISO strings from one synced source.
4. No free-text field ever contains a student's name. If a student types
   their name into a prompt, that is data and it stays, but no field is
   *designed* to hold identity.

## Core spine

Every tool emits all of these.

```ts
session_start       { participantCode, tool, day, deviceId }
task_start          { taskId, round }
attempt_submitted   { attemptId, taskId, artifact, msSinceLastAttempt }
attempt_evaluated   { attemptId, outcome, failureType }
attempt_abandoned   { attemptId }
support_used        { kind }
comparison_shown    { itemA, itemB }
comparison_response { text }
task_complete       { taskId, msElapsed, attemptCount }
session_end         { reason }
```

`artifact` is whatever the student produced — prompt text, probe text, a board
state, an instruction sequence. Store it verbatim. Truncation loses the thing
you are studying.

`outcome` is `pass | fail | partial`.

`reason` on `session_end` is `complete | timeout | navigated_away | crash`.

## Derived fields

Attached to `attempt_submitted`. Computed client-side at submission.

| Field | Definition | Serves |
|---|---|---|
| `editDistanceFromPrevious` | Levenshtein against the previous attempt's artifact on this task | abstraction, debugging |
| `msFromFailureToNextAttempt` | time between the last `attempt_evaluated` with outcome `fail` and this submission | debugging |
| `targetedEdit` | boolean — did the edit intersect the region implicated in the failure | debugging |
| `consecutiveFailures` | count of failed attempts on this task since the last pass | persistence |

`targetedEdit` is exact only where the fault span is known in advance, which
means the Broken Prompt Clinic round. Elsewhere it is inferred and should be
treated as weaker evidence. Record which it is: add `targetedEditExact:
boolean`.

## What each construct is measured by

| Construct | Primary signal | Tool |
|---|---|---|
| Hypothesis testing | single-feature probe proportion; hypothesis revision count | Find the Rule |
| Abstraction | word count trajectory; `comparison_response` coding; transfer round | Prompt Golf |
| Debugging | `targetedEdit`, `msFromFailureToNextAttempt`, `consecutiveFailures` | Prompt Golf (clinic round) |
| Decomposition | step count and reorder-vs-reword across revisions | Two Machines |
| Stochastic reasoning | distinct outputs across five identical runs | Two Machines |
| Constraint reasoning | `liveOptionsAtCommit` | Manifest, Mosaic |
| Stochastic reasoning | random block adoption | RowdyRobo Vac |

Two Machines is the concrete referent for the stochasticity section below: it
holds the artifact constant by construction and shows the variance directly,
rather than inferring it from hash collisions. Use its `run_executed` rows to
calibrate baseline variance before reading variance flags from the other tools.

## The stochasticity confound

On Day 3 tools, a failed attempt has two possible causes: the student's
artifact was wrong, or the model varied. Students cannot distinguish these and
neither can the log unless you make it possible.

Every tool wrapping an LLM must set `failureType` to distinguish:

- `target_not_met` — output did not satisfy the checker
- `nondeterministic_variance` — the same artifact previously passed and now
  did not, or vice versa

Detecting the second requires hashing the artifact and checking whether that
exact artifact has been evaluated before in this session with a different
outcome. Cheap to implement, and it is the field that lets the analysis
separate a real bug from the model simply varying — which is the confound the
existing literature could not resolve.

## Screen and audio subsample

Logs go to everyone. Screen capture plus audio goes to a purposive subsample
of 4–6 students spanning confidence and prior-experience levels, selected in
advance by the research team rather than by seating.

Tag those sessions with `recorded: true` on `session_start` so the analysis
can separate them without a manual roster lookup.

## Coding scheme for `comparison_response`

This is the highest-value artifact in the pilot and it is free text, so the
scheme must exist before the pilot, not after. Draft:

| Code | Definition |
|---|---|
| S | Names a structural feature shared by both items (what the approach did) |
| F | Names a surface feature shared by both items (topic, wording, look) |
| R | Restates one item without relating it to the other |
| N | No relation identified; off-task; blank |

Two raters, independent, on all responses. Report agreement. The S/F boundary
is where disagreement will concentrate — write three worked examples of each
before rating begins.

## Storage

One `events` table, one row per event, JSONB payload. One `sessions` table
keyed on participant code. No identifying fields in either.

Retain raw events through analysis and publication, then delete on a stated
date that appears in the consent and assent forms.
