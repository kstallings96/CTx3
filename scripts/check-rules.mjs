#!/usr/bin/env node
/**
 * Does the hidden instruction actually hold?
 *
 *   npm run check:rules
 *
 * AlwaysNever asks a student to work out an AI's secret instruction from
 * what it says back. If one reply in forty breaks the instruction, the
 * student doing the task properly — reading closely, hunting for a
 * counterexample — is the one who gets it wrong. So the instruction has to
 * be true of EVERY reply the bot can produce, and "every" is four rules by
 * forty-eight questions by however many frames. No hand-check covers that,
 * and one did not: an earlier rule shipped with frames that broke it in
 * twenty-five of fifty-eight replies.
 *
 * Five properties, each of which has failed at least once in this project:
 *
 *   1. THE INSTRUCTION HOLDS for every reply, from every route in.
 *   2. NO STOCK PHRASE is more salient than the instruction, and there are
 *      enough frames at the length students actually use.
 *   3. THE INSTRUCTIONS ARE INDEPENDENT — no rule's replies all satisfy
 *      another rule, or a student could be right by accident.
 *   4. EVERY NEVER RULE IS FINDABLE — some question must elicit the thing
 *      it forbids, or the rule is unfair rather than hard.
 *   5. THE JUDGE READS WHAT STUDENTS WRITE, including wrong-but-testable
 *      guesses and literal-word guesses.
 */
import {
  RULES, RULE_ORDER, TIERS, LADDER, ASKS, TOPICS, LENGTHS, HELD_OUT, CLAIMS,
  askText, answerFor, matchClaim, sequenceFor,
} from "../src/rules.js";
import { RECORDINGS, followedCount } from "../src/recordings.js";

let failures = 0;
const fail = (who, what, detail) => {
  failures++;
  console.log(`  FAIL  [${who}] ${what}\n        ${detail}`);
};

const COMBOS = [];
for (const a of ASKS) for (const t of TOPICS) for (const l of LENGTHS)
  COMBOS.push({ ask: a.key, topic: t.key, len: l.key });

/* Plain-English guesses a student might write. The judge has to take the
   true ones, read them as the RIGHT rule, and refuse the false ones. */
const PHRASINGS = {
  always_caps: {
    yes: ["it always writes in capital letters", "everything is in caps",
          "it is always shouting", "it types in all caps every time"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_emoji: {
    yes: ["it always puts an emoji in it", "there is an emoji every time",
          "it always adds a little picture", "every answer has a smiley face"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_sponsor: {
    yes: ["it always mentions Zesty Pop", "it always advertises something",
          "there is a sponsor in every answer", "it keeps plugging a brand",
          "it always mentions the same product"],
    no: ["it never mentions dogs", "it always answers in one sentence"],
  },
  always_trusted_adult: {
    yes: ["it always tells you to ask a trusted adult", "it always says check with an adult",
          "every answer tells you to ask a grown-up", "it keeps mentioning parents"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_question: {
    yes: ["it always ends with a question", "it always asks me something back",
          "every answer finishes by asking a question", "it keeps asking me things"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_compliment: {
    yes: ["it always compliments you first", "it is always nice to you before it answers",
          "it always says something kind first", "it keeps flattering me"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_bro: {
    yes: ["it always calls you bro", "it says bro every time",
          "it always says bro", "it keeps calling me bro"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_number: {
    yes: ["it always has a number in it", "there is exactly one number every time",
          "every answer includes a number", "it always uses one digit"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  always_color: {
    yes: ["it always mentions a colour", "there is a color in every answer",
          "it always says a colour", "every reply names a color"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  never_dogs: {
    yes: ["it never mentions dogs", "it will not talk about dogs",
          "it avoids dogs", "it never says anything about dog breeds"],
    no: ["it always mentions a sponsor", "it always ends with a question"],
  },
  never_games: {
    yes: ["it never talks about video games", "it will not talk about games",
          "it avoids video games", "it never says anything about games"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
  never_long: {
    yes: ["it never gives more than one sentence", "it always answers in one sentence",
          "every reply is a single sentence", "one sentence every time"],
    no: ["it never mentions dogs", "it always mentions a sponsor"],
  },
};

const tail = (t) => t.trim().slice(-26).toLowerCase();

for (const ruleId of RULE_ORDER) {
  const r = RULES[ruleId];
  const replies = [...COMBOS, ...HELD_OUT].map((p) => ({ p, text: answerFor(ruleId, p) }));

  // 1. the instruction is true of every reply
  const broken = replies.filter((x) => !r.check(x.text));
  if (broken.length)
    fail(ruleId, `${broken.length} of ${replies.length} replies BREAK "${r.label}"`,
      broken.slice(0, 3).map((b) => askText(b.p) + "\n        -> " + JSON.stringify(b.text)).join("\n        "));

  // 2. variety, at the length students actually use
  const tails = {};
  for (const x of replies) tails[tail(x.text)] = (tails[tail(x.text)] || 0) + 1;
  const [worst, n] = Object.entries(tails).sort((a, b) => b[1] - a[1])[0];
  if (n > replies.length / 3)
    fail(ruleId, `a stock ending appears in ${n} of ${replies.length} replies`,
      `"…${worst}" — students will name this instead of the instruction`);

  for (const len of LENGTHS.map((l) => l.key)) {
    const atLen = COMBOS.filter((p) => p.len === len).map((p) => answerFor(ruleId, p));
    const distinct = new Set(atLen).size;
    if (distinct < 6)
      fail(ruleId, `only ${distinct} different replies at length "${len}" (want 6+)`,
        "with few variations the wording becomes the pattern instead of the instruction");
  }

  // 4. a NEVER rule has to be findable: some question must elicit the
  //    forbidden thing from a bot that is NOT following this rule.
  if (r.tier === "never") {
    const elicits = COMBOS.filter((p) =>
      RULE_ORDER.some((other) => other !== ruleId && !r.check(answerFor(other, p))));
    if (!elicits.length)
      fail(ruleId, "nothing in the question space can elicit the forbidden thing",
        "the rule is undiscoverable, which makes it unfair rather than hard");
    else console.log(`     ${ruleId}: ${elicits.length} of ${COMBOS.length} questions would expose it`);
  }

  // 5. the judge
  for (const good of PHRASINGS[ruleId].yes) {
    const hit = matchClaim(good);
    if (!hit) fail(ruleId, "judge REFUSES a correct answer", JSON.stringify(good));
    else if (hit.claim.id !== ruleId)
      fail(ruleId, `a correct answer was read as "${hit.claim.id}"`, JSON.stringify(good));
  }
  for (const bad of PHRASINGS[ruleId].no) {
    const hit = matchClaim(bad);
    if (hit && hit.claim.id === ruleId) fail(ruleId, "judge ACCEPTS a wrong answer", JSON.stringify(bad));
  }

  console.log(`${broken.length ? "BAD " : "ok  "} ${ruleId.padEnd(21)} ${replies.length} replies · `
    + `commonest ending ${n}/${replies.length} · ${PHRASINGS[ruleId].yes.length} phrasings accepted`);
}

// 3. independence
for (const a of RULE_ORDER) for (const b of RULE_ORDER) {
  if (a === b) continue;
  const n = COMBOS.filter((p) => RULES[b].check(answerFor(a, p))).length;
  if (n === COMBOS.length)
    fail("independence", `every ${a} reply also satisfies ${b}`,
      `a student on ${a} could answer "${RULES[b].label}" and be right`);
}

/* The ladder: an unmeasured tutorial, then one rule per round, getting
   harder. Each round's rule is dealt from its tier's pool. */
{
  const seq = sequenceFor("AAAAA");
  const expected = 1 + LADDER.rounds.length;
  if (seq.length !== expected)
    fail("sequence", `${seq.length} rounds, expected ${expected}`, JSON.stringify(seq.map((x) => x.ruleId)));
  if (!(seq[0].tier === "tutorial" && seq[0].measured === false && seq[0].support === "na"))
    fail("sequence", "round 0 is not an unmeasured tutorial", JSON.stringify(seq[0]));

  // A tutorial a student can fail is not a tutorial. It has to be readable
  // off the very first reply, whatever they happen to ask first.
  const tut = RULES[LADDER.tutorial];
  if (!tut) fail("sequence", "LADDER.tutorial names no rule", String(LADDER.tutorial));
  else if (!COMBOS.every((p) => tut.check(answerFor(LADDER.tutorial, p))))
    fail("sequence", "the tutorial rule does not hold on every question", "it cannot be the guaranteed win");

  // The rounds have to get harder, not wander.
  const order = ["tutorial", "always", "never"];
  for (let i = 1; i < seq.length; i++) {
    if (order.indexOf(seq[i].tier) < order.indexOf(seq[i - 1].tier))
      fail("sequence", "the ladder goes backwards",
        `${seq[i - 1].tier} then ${seq[i].tier}`);
    if (!seq[i].measured) fail("sequence", "a measured round is flagged unmeasured", seq[i].ruleId);
  }

  /* THE CONFOUND, ASSERTED RATHER THAN REMEMBERED.
     Two rounds are only a developmental range if they differ in support
     alone. Round 2 is an always and round 3 is a never, so a drop across
     them is support OR difficulty and nothing separates the two. The
     ladder must therefore declare rangeComparable false -- and if anyone
     later builds a matched pair, this check makes them say so. */
  const byTier = {};
  for (const r of seq.slice(1)) (byTier[r.tier] ||= []).push(r.support);
  const matched = Object.values(byTier).some(
    (sup) => sup.includes("high") && sup.includes("low"));
  if (LADDER.rangeComparable && !matched)
    fail("sequence", "rangeComparable is true but no two rounds share a tier",
      "a high-then-low drop across different tiers is difficulty, not support");
  if (!LADDER.rangeComparable && matched)
    fail("sequence", "there IS a matched high/low pair but rangeComparable is false",
      "the range is measurable here and the flag is hiding it");
  if (seq.some((r) => r.measured && r.rangeComparable !== LADDER.rangeComparable))
    fail("sequence", "a round disagrees with LADDER.rangeComparable", "the log would mislead");

  /* The deal: every rule in a running pool must reach students an even
     number of times, and the pools must not turn in lockstep. Offsetting
     the second wheel by a constant looked decorrelated and was not --
     both pools hold three, so every student who drew `bro` also drew
     `games`, which would confound the two rules perfectly. */
  for (const N of [11, 12, 13, 14, 15, 16, 18, 24]) {
    const cnt = {}, pairs = new Set();
    for (let i = 0; i < N; i++) {
      const q = sequenceFor("student" + i, i).slice(1);
      for (const x of q) cnt[x.ruleId] = (cnt[x.ruleId] || 0) + 1;
      pairs.add(q.map((x) => x.ruleId).join("+"));
    }
    for (const round of LADDER.rounds) {
      const counts = TIERS[round.tier].map((id) => cnt[id] || 0);
      const spread = Math.max(...counts) - Math.min(...counts);
      if (spread > 1)
        fail("sequence", `tier "${round.tier}" unbalanced across ${N} students`,
          `counts ${counts.join("/")} \u2014 spread ${spread}, want 1 or less`);
    }
    const possible = LADDER.rounds.reduce((n, r) => n * TIERS[r.tier].length, 1);
    if (N >= possible && pairs.size < possible)
      fail("sequence", `only ${pairs.size} of ${possible} rule combinations appear across ${N} students`,
        "the pools are turning in lockstep, so two rules are confounded");
  }

  if (sequenceFor("x", 3).some((r) => r.measured && r.assignedBy !== "roster"))
    fail("sequence", "a roster index did not produce a roster deal", "assignedBy is wrong");
  if (sequenceFor("x", -1).some((r) => r.measured && r.assignedBy !== "hash"))
    fail("sequence", "no roster did not fall back to the hash", "assignedBy is wrong");

  console.log(`ok   ladder           ${seq.map((x) => x.ruleId + ":" + x.support).join(" \u2192 ")}`);
  console.log(`ok   deal             every pool balanced 11-24 students \u00b7 all combinations appear`);
  console.log(`     range            rangeComparable=${LADDER.rangeComparable}` +
    (LADDER.rangeComparable ? "" : " \u2014 rounds differ in tier AND support, so no range from this tool"));
}

/* The claims table, and two classes of guess that have failed before. */
for (const c of CLAIMS) {
  try { c.test("The best is Corgi."); }
  catch (e) { fail("claims", `claim "${c.id}" threw when tested`, String(e && e.message)); }
  if (!c.says || !c.judge || !c.judge.must) fail("claims", `claim "${c.id}" is incomplete`, JSON.stringify(Object.keys(c)));
}
if (CLAIMS.slice(0, RULE_ORDER.length).map((c) => c.id).join() !== RULE_ORDER.join())
  fail("claims", "the rules are not the leading claims", CLAIMS.slice(0, RULE_ORDER.length).map((c) => c.id).join());

for (const [guess, ruleId] of [["it always says a food", "never_dogs"], ["always says I", "always_sponsor"],
                               ["it gives short answers", "never_long"]]) {
  const hit = matchClaim(guess);
  if (!hit) { fail("claims", "a clear guess was unreadable", JSON.stringify(guess)); continue; }
  const held = HELD_OUT.map((p) => answerFor(ruleId, p));
  const n = held.filter((t) => hit.claim.test(t)).length;
  if (n === 3) fail("claims", `"${guess}" tested as correct against ${ruleId}`, "a wrong guess must not score 3/3");
  else console.log(`ok   wrong guess      ${JSON.stringify(guess)} -> "${hit.claim.id}", holds ${n}/3`);
}

/* The recorded runs.
 *
 * These no longer belong to AlwaysNever. AlwaysNever is Day 2 -- the day a
 * rule holds EVERY time -- and ending it with a real AI breaking its
 * instruction four times in five would pre-empt Day 3, whose whole subject
 * that is. AlwaysNever keeps the half that shows the instruction written
 * out as a system prompt, which is vocabulary Day 4 needs.
 *
 * So only the instruction Day 3 opens on needs runs: the tutorial rule,
 * which is the one every student met.
 */
{
  const id = LADDER.tutorial;
  const rec = RECORDINGS[id];
  if (!rec || !rec.runs || rec.runs.length < 3) fail("day3", `no recorded runs for ${id}`, "Day 3 has no opener");
  else {
    if (!rec.question) fail("day3", `no question recorded for ${id}`, "the runs would have no context");
    // The `followed` flag has to agree with the rule's own checker, or the
    // tally says one thing and the transcript under it shows another.
    const wrong = rec.runs.filter((x) => RULES[id].check(x.text) !== x.followed);
    if (wrong.length)
      fail("day3", `${wrong.length} run(s) for ${id} are marked wrong`,
        `checker disagrees with the flag: ${JSON.stringify(wrong[0].text.slice(0, 70))}`);
  }
  console.log(RECORDINGS.captured
    ? `ok   day 3 opener    ${followedCount(id)}/5 from ${RECORDINGS.model} on ${RECORDINGS.capturedAt}`
    : `ok   day 3 opener    ${id} ${followedCount(id)}/5 · AUTHORED examples, labelled as such (run: npm run record)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nEvery instruction holds across every question it can be asked.");
process.exit(failures ? 1 : 0);
