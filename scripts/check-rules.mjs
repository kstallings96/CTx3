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
  RULES, RULE_ORDER, FTR_SEQUENCE, PILLS, HELD_OUT, COLOURS,
  askText, answerFor, judgeRule, inferPills,
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

  // 3. the judge reads what a student actually writes
  for (const good of PHRASINGS[ruleId].yes)
    if (!judgeRule(r, good)) fail(ruleId, "judge REFUSES a correct answer", JSON.stringify(good));
  for (const bad of PHRASINGS[ruleId].no)
    if (judgeRule(r, bad)) fail(ruleId, "judge ACCEPTS a wrong answer", JSON.stringify(bad));

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

console.log(failures ? `\n${failures} FAILURE(S)` : "\nEvery rule holds across every question it can be asked.");
process.exit(failures ? 1 : 0);
