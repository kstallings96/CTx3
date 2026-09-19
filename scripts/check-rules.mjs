#!/usr/bin/env node
/**
 * Does the hidden rule actually hold?
 *
 *   npm run check:rules
 *
 * Find the Rule asks a student to discover a rule from what the partner says
 * back. If one reply in forty breaks the rule, the student who is doing the
 * task properly — reading closely, looking for a counterexample — is the one
 * who gets it wrong. The rule has to be true of EVERY reply the partner can
 * produce, and "every" here is four rules by forty-eight question
 * combinations by three or four interchangeable frames. No hand-check covers
 * that, and one did not: `short_words` shipped with frames containing
 * "course", "every" and "wrong".
 *
 * This also checks the two other things that make the puzzle solvable:
 *
 *   - NO STOCK PHRASE. If every answer ends "— a solid 10", that tail is
 *     more salient than the rule and students name it instead. No single
 *     tail may account for more than a third of a rule's replies.
 *   - THE JUDGE READS PLAIN ANSWERS. Every rule carries the phrasings a
 *     thirteen-year-old actually writes, and the judge must accept them —
 *     including the ones the interface's own starter chips invite.
 */
import {
  RULES, RULE_ORDER, FTR_SEQUENCE, PILLS, PICKS, HELD_OUT, CLAIMS,
  askText, answerFor, matchClaim, inferPills, cap,
} from "../src/rules.js";

let failures = 0;
const fail = (rule, what, detail) => {
  failures++;
  console.log(`  FAIL  [${rule}] ${what}\n        ${detail}`);
};

/* Every question the pill builder can make. */
const COMBOS = [];
for (const adj of PILLS[0].opts)
  for (const noun of PILLS[1].opts)
    for (const len of PILLS[2].opts) COMBOS.push({ adj, noun, len });

/* Plain-English rule guesses a student might write. The judge has to take
   the true ones and refuse the false ones. */
const PHRASINGS = {
  no_e: {
    yes: ["It never uses the letter E", "no e", "it avoids the letter e",
          "there is never an e", "it doesn't use e", "the letter e is missing"],
    no: ["it always has a number", "it uses short words", "it says a colour"],
  },
  short_words: {
    yes: ["It always uses short words", "every word is four letters or fewer",
          "no word is longer than four letters", "all the words are small",
          "it never uses long words", "the words are all four letters"],
    no: ["it never uses the letter e", "it always has a number"],
  },
  one_number: {
    yes: ["It always has a number", "it uses a number every time",
          "there is always a number", "exactly one number",
          "it puts one number in every answer", "always a digit somewhere"],
    no: ["it never uses a number", "it uses short words", "it says a colour"],
  },
  colour: {
    yes: ["It always says a colour", "there is a colour in every answer",
          "it works a colour in", "every reply mentions a colour",
          "it always has a color"],
    no: ["it never uses a colour", "it always has a number"],
  },
};

const tail = (t) => t.trim().slice(-26).toLowerCase();
/* Which pick a given question produces, mirrored from answerFor so the
   frame-usage check can reconstruct what was chosen. */
const PICK_FOR = (ruleId, p) =>
  PICKS[p.noun][ruleId === "no_e" ? "noE" : ruleId === "short_words" ? "short" : "any"][PILLS[0].opts.indexOf(p.adj)];

for (const ruleId of RULE_ORDER) {
  const r = RULES[ruleId];
  const replies = [];

  for (const pills of COMBOS) replies.push({ pills, text: answerFor(ruleId, pills) });
  // The three held-out questions are shown on the close screen as proof the
  // rule generalises, so they have to obey it too.
  for (const pills of HELD_OUT) replies.push({ pills, text: answerFor(ruleId, pills) });
  // Free-text probes reach the same generator through inferred pills.
  for (const q of ["what am i thinking", "what is 10+10", "tell me a secret",
                   "why is the sky blue", "hello", "asdf", "what's your favourite song"])
    replies.push({ pills: inferPills(q), text: answerFor(ruleId, inferPills(q)), from: q });

  // 1. the rule is true of every reply
  const broken = replies.filter((x) => !r.check(x.text));
  if (broken.length) {
    fail(ruleId, `${broken.length} of ${replies.length} replies BREAK the rule "${r.label}"`,
      broken.slice(0, 3).map((b) => JSON.stringify(b.text)).join("\n        "));
  }

  // 2. no stock phrase more salient than the rule
  const tails = {};
  for (const x of replies) tails[tail(x.text)] = (tails[tail(x.text)] || 0) + 1;
  const [worst, n] = Object.entries(tails).sort((a, b) => b[1] - a[1])[0];
  if (n > replies.length / 3) {
    fail(ruleId, `a stock ending appears in ${n} of ${replies.length} replies`,
      `"…${worst}" — students will name this instead of the rule`);
  }

  // 2b. ENOUGH DIFFERENT FRAMES, AND THE PICKER HAS TO USE THEM.
  //
  // Check 2 looks at all 58 replies across three lengths and passed happily
  // while the categorical rules had four short frames each. A student does
  // not see 58 replies: they send six or eight probes, nearly all "in a few
  // words", and with four frames the ending repeats by the third one. "It
  // has four catchphrases" is then more salient than the rule AND easier to
  // state, which is what a pilot student reported.
  //
  // Counting distinct TAILS does not catch it either: a short answer is
  // shorter than the tail window, so the pick is inside it and sixteen picks
  // look like sixteen endings. Count the FRAMES, and separately confirm the
  // hash actually spreads across them rather than favouring three.
  for (const len of PILLS[2].opts) {
    const frames = r.say[len] ? r.say[len].length : 0;
    const want = len === "in a few words" ? 6 : 4;
    if (frames < want)
      fail(ruleId, `only ${frames} frames for "${len}" (want ${want})`,
        "with few frames the ending becomes the pattern instead of the rule");

    // Which frames does the picker actually reach across the sixteen
    // questions? A frame that is never chosen is not variety.
    const used = new Set(COMBOS.filter((p) => p.len === len)
      .map((p) => r.say[len].findIndex((f) => f(cap(PICK_FOR(ruleId, p))) === answerFor(ruleId, p))));
    used.delete(-1);
    if (frames >= want && used.size < Math.min(frames, want))
      fail(ruleId, `"${len}" defines ${frames} frames but the picker only uses ${used.size}`,
        "the hash is clustering; students will still see repeats");
  }

  // 3. the judge reads what a student actually writes, and reads it as the
  //    RIGHT claim -- a correct answer must not be matched to some other
  //    claim that happens to share a word with it.
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

  // 4. the off-topic redirect obeys the rule too. It is prepended to a real
  //    answer, so a careless word in it breaks the puzzle exactly as a
  //    careless word in a frame does.
  if (r.offTopic) {
    const bad = replies.filter((x) => !r.check(r.offTopic + " " + x.text));
    if (bad.length)
      fail(ruleId, `the off-topic opener breaks the rule in ${bad.length} of ${replies.length} replies`,
        JSON.stringify(r.offTopic + " " + bad[0].text));
  } else {
    fail(ruleId, "no off-topic opener", "a question it cannot answer would get a non-sequitur");
  }

  const ok = broken.length === 0;
  console.log(`${ok ? "ok  " : "BAD "} ${ruleId.padEnd(13)} ${replies.length} replies · `
    + `commonest ending ${n}/${replies.length} · ${PHRASINGS[ruleId].yes.length} phrasings accepted`);
}

/* The sequence every student walks, and why it is what it is. */
const seqRules = FTR_SEQUENCE.map((s) => s.ruleId);
if (seqRules.join() !== RULE_ORDER.join())
  fail("sequence", "FTR_SEQUENCE and RULE_ORDER disagree", seqRules.join() + " vs " + RULE_ORDER.join());
for (let i = 0; i < FTR_SEQUENCE.length; i += 2) {
  const [a, b] = [FTR_SEQUENCE[i], FTR_SEQUENCE[i + 1]];
  if (!b) break;
  if (RULES[a.ruleId].tierWord !== RULES[b.ruleId].tierWord)
    fail("sequence", "a high/low pair spans two kinds of rule",
      `${a.ruleId} (${RULES[a.ruleId].tierWord}) then ${b.ruleId} (${RULES[b.ruleId].tierWord}) — difficulty is supposed to be held constant within a pair`);
  if (!(a.support === "high" && b.support === "low"))
    fail("sequence", "a pair is not high-then-low", `${a.ruleId}:${a.support} then ${b.ruleId}:${b.support}`);
}

/* Two rules a student could satisfy by accident with one answer are not two
   rules. This is how `no_the` was caught: "the" contains an E. */
for (const a of RULE_ORDER) for (const b of RULE_ORDER) {
  if (a >= b) continue;
  const both = COMBOS.filter((p) => RULES[b].check(answerFor(a, p))).length;
  if (both === COMBOS.length)
    fail("overlap", `every ${a} answer also satisfies ${b}`,
      "the two rules are not independently discoverable");
}

/* Every claim the judge can match must be testable and complete. A claim
   whose test throws would take the close screen down mid-lesson. */
for (const c of CLAIMS) {
  try { c.test("Mint chip, obviously."); }
  catch (e) { fail("claims", `claim "${c.id}" threw when tested`, String(e && e.message)); }
  if (!c.says || !c.judge || !c.judge.must) fail("claims", `claim "${c.id}" is incomplete`, JSON.stringify(Object.keys(c)));
}

/* The four real rules have to come first, so a correct answer is never
   stolen by a looser claim that happens to share a word with it. */
if (CLAIMS.slice(0, 4).map((c) => c.id).join() !== RULE_ORDER.join())
  fail("claims", "the four rules are not the first four claims",
    CLAIMS.slice(0, 4).map((c) => c.id).join() + " vs " + RULE_ORDER.join());

/* A wrong-but-testable guess has to come back WRONG rather than unreadable —
   that is the whole reason claims exist. "It always says a food" is the
   guess a real student made; against the colour rule it must be matched,
   tested, and found not to hold. */
{
  const held = HELD_OUT.map((p) => answerFor("colour", p));
  const hit = matchClaim("it always says a food");
  if (!hit) fail("claims", "a clear wrong guess was unreadable", '"it always says a food"');
  else if (hit.claim.test && held.every((t) => hit.claim.test(t)))
    fail("claims", "a wrong guess tested as correct", `"food" held for all three colour replies: ${JSON.stringify(held)}`);
  else console.log(`ok   wrong guesses   "it always says a food" -> read as "${hit.claim.id}", holds for `
    + held.filter((t) => hit.claim.test(t)).length + "/3");
}

/* "Always says I" — a real pilot guess. Naming a literal word the replies
   supposedly always contain is about the most checkable claim there is, and
   the fixed list could not read it because nobody had thought of it. The
   judge synthesises a claim from whatever word was named. */
for (const [guess, ruleId] of [
  ["always says I", "short_words"],
  ["it uses my every time", "short_words"],
  ["it always says the word the", "no_e"],
]) {
  const hit = matchClaim(guess);
  if (!hit) { fail("claims", "a literal-word guess was unreadable", JSON.stringify(guess)); continue; }
  const held = HELD_OUT.map((p) => answerFor(ruleId, p));
  const n = held.filter((t) => hit.claim.test(t)).length;
  if (n === 3) fail("claims", `"${guess}" scored 3/3 against ${ruleId}`, "a wrong guess must not test as correct");
  else console.log(`ok   literal guess  ${JSON.stringify(guess)} -> "${hit.claim.id}", holds ${n}/3`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nEvery rule holds across every question it can be asked.");
process.exit(failures ? 1 : 0);
