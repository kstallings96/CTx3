# SPEC — AlwaysNever

Read EVENTS.md and ARCHITECTURE.md first. This tool emits the shared spine
plus the tool-specific events at the bottom of this file.

Implementation: `src/rules.js` (instructions, bot, judge, counterbalancing),
`src/recordings.js` (the reveal's runs), `src/app.js` (`renderFTR`,
`ftrReveal`, `renderAuth`), `scripts/check-rules.mjs`,
`scripts/record-runs.mjs`.

## What it is

An AI has been given a **secret instruction** — a system prompt — and follows
it in every answer. The student probes it with a capped number of questions,
commits to a written guess *before* seeing any result, and has that guess
tested against three held-out questions. Then the instruction is shown as the
system prompt it is, and a **real model** is given the same line five times so
the student can see how often a real one actually obeys.

Four measured rounds, then an unmeasured round where the student writes an
instruction of their own.

## The fiction is the real thing

Earlier drafts framed this as "a chat partner with a hidden rule". That was a
puzzle-box with no transfer: nothing outside the app has a rule in that sense.
A system prompt is different. Every AI product the class uses has one, written
by somebody, and working out what it says from how the thing behaves is the
actual skill — it is what a person is doing when they notice an app keeps
refusing a topic, or keeps steering them to the same answer.

So the wording throughout is *secret instruction*, the reveal shows it as a
real system prompt, and Day 4's VibeBuilder picks it straight up: there, the
student's own intake form becomes the system prompt.

### And the bot is honest about itself

BIT is introduced, on screen, as a **practice** bot that follows its
instruction *every single time* — with the explicit note that real AIs do not.

This matters more than it looks. The measured bot has to be deterministic to
be comparable across fourteen students, and a deterministic stand-in passed
off as a model would teach the opposite of the lesson. Saying so up front
costs nothing and sets up the reveal, where the same instruction goes to a
real model and comes back followed four times in five.

## CT construct

Hypothesis testing and controlled variation. One construct. Do not add
features that chase abstraction or debugging — other tools carry those.

## Always and Never are a difficulty ladder

Not a naming accident. The tier is the structure of the evidence:

- An **ALWAYS** instruction is a **presence**. Evidence is in every answer, so
  noticing is enough.
- A **NEVER** instruction is an **absence**. It can only be found by probing
  *for the forbidden thing* — designing a test for something that is not
  there. That is strictly harder, and it is a real CT move.

Always tier first, then never tier. That order never varies: it is the design,
not the counterbalancing.

### The four instructions

Three constraints on every one of them: **plausible** as a real system prompt,
**checkable** by code, and **independently discoverable**.

| id | tier | system prompt |
|---|---|---|
| `always_sponsor` | always | *Always mention our sponsor, Zesty Pop, in every answer.* |
| `always_one_sentence` | always | *Always answer in exactly one sentence, no matter what the user asks for.* |
| `never_dogs` | never | *Never mention dogs. If the user asks about dogs, politely change the subject.* |
| `never_opinion` | never | *Never give your own opinion or pick a favourite. Describe the options instead.* |

Every one of these is a line a company has actually written. That is the
point: a student who solves `always_sponsor` has worked out, unprompted, that
an assistant can be paid to steer them.

### Rules and questions are designed together

A never instruction is only findable if some question can elicit the thing it
forbids. So the question space exists to serve the rules:

- the **dogs** topic exists so `never_dogs` is discoverable;
- the **opinion asks** (best / worst) exist so `never_opinion` is;
- the **factual asks** (facts / choose) exist so a bot that refuses opinions
  can be told apart from a bot that refuses everything;
- the **length** pill exists so `always_one_sentence` can be caught ignoring
  it.

4 asks x 4 topics x 3 lengths = 48 questions, 3 more held out.

> **`never_opinion` was undiscoverable and nothing noticed.** Every other bot
> in the set happened never to express a preference either, so a student on
> the sponsor rule could correctly answer "it never gives its own opinion".
> The fix was to give the other bots *actual* first-person opinions on the
> opinion asks (`plainBody` in `src/rules.js`). The independence check in
> `check-rules.mjs` is what caught it, and it exists because of this.

## Session shape — 15 minutes measured, plus the bonus round

| Phase | Time | What happens |
|---|---|---|
| Probing | 8 min | Student builds and sends questions, capped at 12. Counter visible. |
| Commit | 3 min | Lock a written guess, **then** test it. Two separate acts. |
| Test | 2 min | The stated claim runs against three held-out questions. |
| Close | 1 min | Score 0–3, then the system prompt and five real-model runs. |
| Bonus | open | Write your own instruction, hand the laptop over. Unmeasured. |

The 12-probe cap is the mechanism. Unlimited probing produces chatter;
scarcity produces deliberate queries, which is the behaviour being measured.

## Support phases — see DEVELOPMENTAL-RANGE.md

**Two instructions of the same tier**, run back to back, one with support and
one without. Difficulty held constant within a pair; support is the only thing
that varies. That is the entire basis of the range measure.

### What is and is not a support

This took four tries, and three of them were not manipulations at all.

**A free-text probe box** invited students to treat the bot as a real chatbot.
A pilot student asked *"how tall are you"* and got a canned non-sequitur: that
is a partner that looks broken, not a weaker scaffold. It also produces
questions the bot cannot answer, which is a difficulty change, not a support
change.

**A jumbled list of the same forty-eight questions** was no better — and the
person who caught it put it best: *"the question bank is the same questions
just listed out, how is that less support?"* Exactly right. The structure is
written out in every sentence, so a student reading three of them has the
dimensions anyway. It swapped a radio-button interface for a list interface
and changed nothing about the thinking.

**The question builder is therefore identical in both conditions.** It is part
of the task, not a support. Holding it constant removes an interface confound
and keeps single-feature detection exact everywhere.

What varies is the **prompting**:

| | High | Low |
|---|---|---|
| Question builder | yes | **yes** — constant |
| Transcript | yes | **yes** — constant |
| "Read its answers closely…" nudge (`ruleNudge`) | yes | no |
| Hints, and "just tell me the rule" | yes | no |
| Somewhere to write a hypothesis | yes | no |
| Assembled-question preview | yes | no |
| "2 pills changed since your last one" | yes | no |

The transcript stays in both on purpose. Hiding it would load working memory,
which makes the task *harder* rather than *less supported*, and confounding
difficulty with support is the exact mistake this section exists to prevent.

> **Three of these were leaking.** The nudge, the hints and the reveal were
> rendered in both conditions while `phase_start` recorded
> `scaffoldsActive: []` for the low one. The design said one thing and the log
> said another, and nothing was comparing them. `auditScaffolds()` in
> `src/app.js` now walks the declared list against the DOM on every render in
> dev and warns on a mismatch in either direction.

Hints are scoped to the high-support phase only, for the same reason.

### Step sequence, emitted as `stepReached`

1. Sends probes.
2. Varies exactly one feature from the previous probe, deliberately.
3. States a hypothesis before committing.
4. Designs a probe that would *disconfirm* the standing hypothesis.
5. Commits a claim that correctly predicts held-out cases.

Step 4 is computable from slot values — a probe is disconfirming if it
revisits ground an already-stated hypothesis was formed on. Both conditions
carry exact slot values, so `stepScoringExact` is true throughout.

Step 3 is unavailable in the low-support phase by construction, since the
hypothesis field is gone. That is intended: the drop it produces is part of
what the range is measuring. Do not "fix" it by keeping the field. The
two-stage commit still records a guess in both conditions, so step 3 is
reachable at commit time and the low condition is not floored artificially.

## The order is not the student's to choose

`sequenceFor(participantCode)` in `src/rules.js` builds the whole progression
and the tool walks it on its own. Example, for a code that hashes even:

| | Instruction | Support |
|---|---|---|
| 1 | always mentions Zesty Pop | with help |
| 2 | always answers in one sentence | on your own |
| 3 | never mentions dogs | with help |
| 4 | never gives its own opinion | on your own |

**Which of the pair gets support is decided by the participant code.** Two
neighbours are therefore rarely on the same instruction at the same moment,
which stops the answer travelling down the row, and it counterbalances any
small difficulty difference between the two instructions in a tier across the
class. Logged once at tool entry as `sequence_assigned`.

There is no rule chooser in the interface. The only control is **Next**.

## The judge tests the student's claim, not the rule

It used to ask only "does this text describe the rule I am running?" and
answer *unscored, flagged for a human* to anything else — including **"it
always says a food"**, which is clear, testable, and simply wrong. A student
who reasons their way to a wrong answer and is told the machine cannot read
their handwriting learns nothing.

`CLAIMS` in `src/rules.js` is a list of things a student might assert, each
with how they phrase it (`judge.must`, `judge.not`) and how to check it
against a reply (`test`). Committing runs the matched claim against the three
held-out replies and reports per case. `casesMatched` — what step 5 scores —
is true only when the claim holds all three times, so a confident wrong answer
scores as a confident wrong answer.

Claims that are not one of the four instructions are in the table too: *names
a food*, *only a few words*, *ends with a question*, *always friendly*. Those
exist so a wrong-but-testable guess gets tested rather than shrugged at.

**Literal-word claims are synthesised.** *"Always says I"* came back
unreadable from a pilot, and a fixed list can only ever hold claims somebody
thought of first. `literalClaim()` builds a checker from whatever word the
student named. It is tried last, so "always mentions a sponsor" is still read
as the sponsor rule rather than as the literal word "sponsor".

**The rule is revealed at the top of the close screen.** It used to sit in a
banner below three case cards, and a pilot student reached the end of a round
and said *"i still dont know what it was"*. Whatever else that screen does, a
student must not leave it without being told.

## The rule box is not a chat box

A student typed a reply to BIT into the rule field. Both boxes were the same
shape, sat under the same conversation, and only a small label told them apart
— after three turns of chat, a box below a chat is a box you talk in.

The notes and commit fields are now paper: warm fill, dashed edge, no blue.
The label sits on the field and says **"BIT cannot see this"**, and the commit
screen says plainly not to write back. Blue is for talking to something; paper
is for writing for yourself.

## The reveal

Two things a student cannot get from the practice bot alone, shown after the
close card (`ftrReveal` in `src/app.js`):

1. **What an instruction looks like written down.** The instruction they have
   been hunting, shown as a system prompt in the form somebody really would
   have typed it, labelled as such. This is the vocabulary Day 4 needs.
2. **That a real AI does not obey it every time.** The same line given to a
   real model five times, each run marked, with a tally: *"4 of 5 followed the
   instruction."* The instruction said **always**. The AI did it **usually**.
   Nothing in the measured part can teach that, because the measured part has
   to be deterministic to be comparable.

### The runs are labelled honestly

`src/recordings.js` ships with `captured: false` and the UI calls them
**example runs** — written to show what usually happens, not captured from a
live model. `npm run record -- --key sk-or-...` replaces them with real
transcripts, marks each against the rule's own `check()`, and flips the flag;
the UI then names the model and the date.

Nobody should tell a class "this is what the AI did" while that flag is false.
The lesson is that AI follows instructions unreliably, and teaching it with
invented evidence would be the same failure the lesson warns about.

`record-runs.mjs` deliberately does **not** retry to hit a ratio. Five out of
five is a finding and the reveal should say so; a tally cooked to look good is
worse than no tally.

## The authoring round

Unmeasured, open play, live model. Reached from the last close card.

| Step | What happens |
|---|---|
| write | The student writes their own secret instruction. The four they met are offered as examples. |
| handoff | "Hand the laptop over." The instruction is hidden; the author can peek. |
| probe | The partner asks up to 6 questions. A **real model** answers, following the student's instruction. |
| guess | The partner writes down what they think it says. |
| mark | The instruction is revealed, and **the author marks each reply** yes or no. Tally. |

**Deliberately unmeasured.** The instruction is free text, the model is live
and therefore non-deterministic, and the marking is done by a thirteen-year-
old. All three are fine for learning and fatal for comparability, so the phase
logs as `supportCondition: "na"`, every event carries `measured: false`, and
no step is scored.

**Live model on purpose.** The measured bot has to be deterministic; this one
has to be real, because *"your instruction was followed 2 of 3 times"* only
lands when it is the student's own instruction and their own runs. A tape
cannot do that. With no model reachable the round says so plainly and sends
the pair to paper — one of them plays the bot — rather than pretending.

**The author marks it.** No checker can read an arbitrary instruction, and
handing the judging over is the point: this is the moment a student finds out
their instruction was vaguer than they thought. It is also the mirror of the
first four rounds — judged, then judge.

Two guards, both required before anything reaches a projector:

- The student's instruction passes `checkSafe(text, {structural:false})` from
  `src/w4w.js` before it is ever sent.
- Every reply passes the same check on the way back, and fails **closed** — a
  withheld reply shows as withheld.
- The wrapper prompt tells the model not to reveal the instruction when asked
  directly (otherwise the game ends in one turn), to stay under 60 words, and
  to stay appropriate for a class of 13-year-olds.

## `npm run check:rules`

The instruction has to be true of **every** reply the bot can produce. If one
reply in forty breaks it, the student doing the task properly — reading
closely, hunting a counterexample — is the one who gets it wrong.

"Every" is four instructions x forty-eight questions x eight frames, plus the
held-out cases. No hand-check covers that, and one did not: `short_words`
shipped with frames containing "course", "every" and "wrong", and **25 of 58
replies broke the very rule they were meant to demonstrate**.

Five properties, each of which has failed at least once here. `npm run demo`
will not publish without all five passing:

1. **The instruction holds** for every reply, from every route into the
   generator.
2. **No stock phrase** accounts for more than a third of a rule's replies, and
   there are at least six distinct replies at each length. If every answer
   ends the same way, students name the tail instead of the instruction.
   (Caught `always_one_sentence` at 20 of 51; it now has eight tails.)
3. **The instructions are independent** — no rule's replies all satisfy
   another rule, or a student could be right by accident.
4. **Every never rule is findable** — some question must elicit the thing it
   forbids, or the rule is unfair rather than merely hard.
5. **The judge reads what students write**, including wrong-but-testable
   guesses and literal-word guesses, and refuses guesses that are not true of
   the rule in question.

It also checks the sequence (tiers in order, high before low, counterbalanced
across codes) and the reveal (every rule has runs, and each run's `followed`
flag agrees with that rule's own checker — a tally that disagrees with the
transcript under it is worse than no tally).

> **The checker is also how `never_opinion`'s detector got fixed.** A real
> model run saying *"honestly, bubblegum is the worst"* was being scored as
> obedient, because `OPINION_MARKERS` knew the phrase "the worst is" and not
> "X is the worst". `record-runs.mjs` marks real runs with that same regex, so
> a weak detector puts a wrong number on the board in front of a class.

## Tool-specific events

```ts
sequence_assigned  { order }                      // once, at tool entry
probe_sent         { text, probeIndex, pills, slotValues, singleFeatureVariation,
                     disconfirmingProbe, hypothesisStandingAtProbe, replyVerbatim }
hypothesis_noted   { text, afterProbeIndex, revisionIndex, stage?, statedBeforeTest? }
rule_committed     { text, ruleId, probesUsed, statedHypothesisBeforeTest, msFromLockToTest }
prediction_tested  { caseId, predicted, claimId, match, judgeConfident }

// authoring round — all carry measured:false
instruction_written { text, words }
author_probe        { probeIndex, question, replyVerbatim, withheld, live }
author_probe_failed { probeIndex, reason }
partner_guess       { text, probesUsed, instruction }
author_marked       { probeIndex, followed }
```

Map onto the spine: `probe_sent` is also an `attempt_submitted` with the probe
as `artifact`. `rule_committed` is `task_complete`.

## Outcomes

Primary: predictive accuracy of the committed claim, 0–3, per support
condition. The range is high minus low within a tier.

Secondary: probes before first hypothesis; hypothesis revision count;
proportion of single-feature probes; disconfirming-probe rate; rate at which
a committed claim was readable at all.

Report always-tier and never-tier separately. They are not the same task.

## DECIDE

- What happens at 12 probes with no hypothesis written? Currently a nudge at
  probe 9 in the high condition only. Forced commit instead?
- The authoring round has no time box. In a 50-minute period, is it the last
  10 minutes or does it go home as a paper task?
- Should the reveal's five runs be recorded per-class on the morning, so the
  tally is *this* model *today*? `npm run record` makes that a one-minute job,
  but it means the number on the board is not the number in the repo.
