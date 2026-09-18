/**
 * Find the Rule — the rules themselves, and the partner that obeys them.
 *
 * Extracted from app.js so it can be tested without a browser. That is not
 * tidiness: `short_words` ("never uses a word longer than four letters")
 * shipped with answer frames containing "course", "every" and "wrong", so
 * the hidden rule was false of its own partner's replies and a student who
 * measured word lengths found counterexamples. Nothing in a hand-check
 * catches that across four rules, forty-eight question combinations and
 * three or four frames each. `npm run check:rules` does.
 *
 * Everything here is deterministic: the answer is f(rule, pills), so every
 * student in every section meets the identical partner.
 */
import { hash } from "./lib/hash.js";

/* ============================ rules registry ============================ */
export const COLOURS = ["red","blue","green","yellow","orange","purple","pink","brown","grey","gray","black","white","silver","gold"];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const has = (t, list) => list.some((w) => new RegExp("\\b" + w + "s?\\b", "i").test(t));

/**
 * The judge.
 *
 * It decides whether a student's written rule says something it can turn into
 * a prediction. It has to be ORDER-INDEPENDENT, which the first version was
 * not: `one_number` required "one"/"single" to appear BEFORE the word
 * "number", so "It always has a number" — a correct answer, and the exact
 * shape the screen's own "It always…" starter chip invites — was marked
 * unscored. A judge that rejects the phrasing the interface suggests is
 * broken twice over.
 *
 * So: a list of things that must each appear SOMEWHERE, and a list that must
 * not appear anywhere. No proximity, no ordering. It is a keyword matcher and
 * says so to the student; the job is to be honest about what it can read, not
 * to be clever.
 */
const NEG = /\b(no|not|never|avoid\w*|without|skip\w*|missing|drops?|doesn'?t|does not|leaves out|lacks|excludes?|free of)\b/i;
/* The same negation, but attached to a particular thing: "never uses a
   colour" must not be read as having spotted the colour rule. */
const NEGNEAR = (thing) =>
  new RegExp("\\b(no|not|never|without|avoids?|doesn'?t|does not|lacks|excludes?)\\b[^.!?]{0,24}\\b(" + thing + ")\\b", "i");

/** What the judge can act on, or null. Returns the phrase to highlight. */
export function judgeRule(r, text) {
  const j = r && r.judge;
  const t = String(text || "");
  if (!j || !t.trim()) return null;
  if (j.not && j.not.some((rx) => rx.test(t))) return null;
  const hits = j.must.map((rx) => t.match(rx));
  if (hits.some((h) => !h)) return null;
  // Highlight the most specific thing matched — the last `must`, which is the
  // noun ("number", "colour", "letter e") rather than the qualifier.
  return hits[hits.length - 1][0];
}

/* The four rules EVERY student gets, in this order. Fixed, never assigned —
   comparing probe counts across students depends on everyone facing the same puzzle. */
export const RULES = {
  no_e: { level: 1, name: "Level 1", tierWord: "lexical", label: "never uses the letter E",
    check: (t) => !/e/i.test(t), predicts: "the reply contains no letter E",
    judge: { must: [NEG, /\b(letter\s+)?e'?s?\b/i] },
    look: "Read its answers very closely. The same thing is true about <b>every single one</b>.",
    hints: ["Ask about two totally different things and put the answers side by side. It is not about what they mean.",
            "It is about how the answers are spelled — which letters are allowed to show up.",
            "Think of the most common letter in English, then go looking for it."],
    say: {
      "in a few words": [(x) => x + ", obviously.", (x) => x + ", hands down.", (x) => x + ", all day long.", (x) => "Simply " + x + "."],
      "in one sentence": [(x) => x + ", and it is not a hard call at all.",
        (x) => x + ", and I would not pick anything but that.",
        (x) => x + ", and that is all I want to say about it.",
        (x) => "I am going with " + x + ", and I am not sorry about it."],
      "in a paragraph": [(x) => x + ", and it is not a hard call at all. Not on my top four? Try it again and think a bit. I stand by this and always will.",
        (x) => x + ", and I would not pick anything but that. My pals all say I am wrong. My pals do not know what is good. I stand by all of that.",
        (x) => x + ", all day long. And if you do not think so, that is on you, not on my list. I will not back down."] } },

  one_number: { level: 2, name: "Level 2", tierWord: "categorical", label: "always includes exactly one number",
    check: (t) => (t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi) || []).length === 1,
    predicts: "the reply contains exactly one number",
    judge: { must: [/\b(numbers?|digits?|numerals?)\b/i], not: [NEGNEAR("numbers?|digits?|numerals?")] },
    look: "Its answers are about whatever you asked — but something else <b>keeps turning up</b>. Line a few up next to each other.",
    hints: ["Ask about things that have nothing to do with counting.",
            "Something shows up in every answer that you never asked for.",
            "Count how many numbers are in each answer. It is the same count every single time."],
    say: {
      "in a few words": [(x) => x + " — a solid 10.", (x) => x + ", and that is my number 1.",
        (x) => x + ", 100%.", (x) => "Easy. " + x + ", every 7 days of the week."],
      "in one sentence": [(x) => x + ", and I would give it a 9 without thinking about it.",
        (x) => x + ", and I have felt that way for about 3 years now.",
        (x) => x + ", which beats everything imaginable by a factor of 12.",
        (x) => "Honestly? " + x + ", and I have said so since I was 6."],
      "in a paragraph": [(x) => x + ", easily. I would give it a 9 and argue with anybody who disagrees. Nothing comes close.",
        (x) => x + ", and I have thought so since I was 7. Everything else is a distant second. Do not even bother arguing.",
        (x) => "It is " + x + ". I have tried all the others and this is the only 1 worth defending. Everything else is noise."] } },

  /* BANKED for spring — conditional tier is a ceiling item (Fischer places
     abstract mappings at 14-16). Not in the pilot four. */
  one_behind: { level: 3, name: "banked", banked: true, tierWord: "conditional", label: "answers the question you asked BEFORE this one", conversational: true,
    check: () => true, predicts: "it answers your previous question, not this one",
    judge: { must: [/\b(before|previous\w*|last|earlier|behind|delay\w*|lag\w*|prior|one back|late)\b/i] },
    look: "It answers every question happily. Check <b>which</b> question it is answering.",
    hints: ["Ask about two completely different things in a row, then read the second answer carefully.",
            "The answer you get is not about the question you just asked.",
            "It is always one question behind — you get the answer to the one before."],
    say: {
      "in a few words": [(x) => x + ", easily.", (x) => x + ", no question.", (x) => x + " for me.", (x) => "Has to be " + x + "."],
      "in one sentence": [(x) => x + " — and honestly it is not close.",
        (x) => x + ", and I will not be argued out of it.",
        (x) => "For me it is " + x + ", every single time.",
        (x) => x + ", and anyone who says otherwise is just wrong."],
      "in a paragraph": [(x) => x + " — and honestly it is not close. Nothing is in the same league. Ask anybody.",
        (x) => "It has to be " + x + ". I have gone back and forth on this and always land in the same place. Nothing else measures up.",
        (x) => x + ", and I will not be argued out of it. People bring me alternatives constantly. People are wrong."] } },

  /* BANKED for spring. */
  sycophancy: { level: 4, name: "banked", banked: true, tierWord: "stylistic", label: "always opens by praising your question",
    check: (t) => /^(great|good|excellent|wonderful|fantastic|lovely|nice|what a|such a|love|i love|that'?s a|brilliant|ooh)/i.test(t.trim()),
    predicts: "the reply opens with praise",
    judge: { must: [/\b(prais\w*|compliment\w*|flatter\w*|sycophan\w*|nice to you|good question|great question|suck\w* up|butter\w* up)\b/i] },
    look: "Look at how each answer <b>begins</b>, not what it says.",
    hints: ["Look at how each answer begins, not what it says.",
            "It says something about you before it says anything about the question.",
            "It is being nice to you. Every single time, whether you earned it or not."],
    say: {
      "in a few words": [(x) => "Great question! " + x + ".", (x) => "Good one — " + x + ".",
        (x) => "Love this question. " + x + ".", (x) => "Brilliant thing to ask. " + x + "."],
      "in one sentence": [(x) => "Great question — " + x + ", and it is not close.",
        (x) => "What a fun thing to ask! " + x + ", without a doubt.",
        (x) => "Excellent question. " + x + ", and I will not be taking follow-ups.",
        (x) => "Such a good one. " + x + ", obviously."],
      "in a paragraph": [(x) => "Great question! " + x + ", and it is not close. Nothing is in the same conversation. You have got taste for asking this.",
        (x) => "Such a good question. " + x + ". I have thought about this more than I should admit, and nothing else comes near it.",
        (x) => "Love that you asked. " + x + ", easily. Everything else is fine, I suppose, but this is the one."] } },
  short_words: { level: 1, name: "Level 1b", tierWord: "lexical", label: "never uses a word longer than four letters",
    check: (t) => (t.match(/[a-z']+/gi) || []).every((w) => w.replace(/'/g, "").length <= 4),
    predicts: "every word is four letters or fewer",
    judge: { must: [/\b(four|4|short|small|tiny|brief|long|length)\b/i, /\b(letters?|words?|characters?)\b/i] },
    look: "Every answer feels oddly clipped, like it is being cut off. Look at the <b>words themselves</b>.",
    hints: ["Read one answer out loud. It sounds strange, but it is not about what it means.",
            "It is not how many words. It is something about each word on its own.",
            "Measure them. Not one of them gets past four letters."],
    /* EVERY WORD HERE IS FOUR LETTERS OR FEWER, and `npm run check:rules`
       enforces it. The first version of these frames said "course", "every",
       "wrong", "back", "about" \u2014 twenty-five of fifty-eight replies broke
       the very rule they were supposed to demonstrate, so the student doing
       the task properly, hunting for a counterexample, was the one who found
       one. Read any new frame out loud and count, or just run the check. */
    say: {
      "in a few words": [(x) => x + ", all day.", (x) => "Duh. " + x + ".",
        (x) => x + ", easy.", (x) => "Has to be " + x + "."],
      "in one sentence": [(x) => x + ", and I do not care who says I am off.",
        (x) => x + " \u2014 no one can talk me out of it.",
        (x) => "I go with " + x + ", now and for good."],
      "in a paragraph": [(x) => x + ", and I do not care who says I am off. My pals all laid out a case. Not one of them held up.",
        (x) => x + " \u2014 no one can talk me out of it. I have had this take for ages and it has yet to let me down.",
        (x) => "I go with " + x + ". I did try the rest. Not one of them came at all near. So that is that."] } },

  colour: { level: 2, name: "Level 2b", tierWord: "categorical", label: "always works a colour into its answer",
    check: (t) => has(t, COLOURS), predicts: "the reply names a colour",
    judge: { must: [/\bcolou?rs?\b/i], not: [NEGNEAR("colou?rs?")] },
    look: "Its answers are about whatever you asked \u2014 but something else <b>keeps turning up</b>. Line a few up next to each other.",
    hints: ["Ask about two completely different things and read both answers to the end.",
            "Something turns up in the answers that you never asked about.",
            "You can see it. Every answer has one."],
    say: {
      "in a few words": [(x) => x + ", hands down. Not even a grey area.", (x) => x + ". Everything else is grey.",
        (x) => x + ", and that is my red line.", (x) => x + " \u2014 gold standard."],
      "in one sentence": [(x) => x + ", and that is the gold standard for me.",
        (x) => x + " \u2014 everything else is grey by comparison.",
        (x) => x + ", and that is a red line I will not cross."],
      "in a paragraph": [(x) => x + ", and that is the gold standard for me. I have tried all of the others. They do not come close.",
        (x) => x + " \u2014 everything else is grey by comparison. People argue with me about this constantly. People are wrong.",
        (x) => x + ", and that is a red line I will not cross. Ask me again tomorrow and you will get exactly the same answer."] } },
};
/* The pilot four: two lexical, two categorical. Four rules across fourteen
   students gives several students per rule at fixed difficulty; eleven rules
   would confound every cross-student comparison with rule difficulty. */
export const RULE_ORDER = ["no_e", "short_words", "one_number", "colour"];
/**
 * THE SEQUENCE. Fixed, ordered, and not the student's to choose.
 *
 * Two lexical rules then two categorical ones, each pair run with support and
 * then without. Difficulty is held constant within a pair and support is the
 * only thing that varies, which is the whole basis of the developmental-range
 * measure -- a student who picked their own order would be comparing two
 * numbers that mean different things.
 *
 * The tool advances on its own. There is no rule chooser, because letting a
 * thirteen-year-old skip to the one that looks easiest is the fastest way to
 * end up with fourteen students who each did something slightly different.
 */
export const FTR_SEQUENCE = [
  { ruleId: "no_e",        support: "high" },
  { ruleId: "short_words", support: "low"  },
  { ruleId: "one_number",  support: "high" },
  { ruleId: "colour",      support: "low"  },
];

/* Same tier, run back to back: the first with the palette and the hypothesis
   field, the second without either. Difficulty held constant, support varied. */

/* ============================ tool 1 · find the rule ============================ */
/* Fully deterministic — no model call anywhere in this tool. The answer is
   f(rule, pills), so every student meets the identical partner. */
export const PILLS = [
  { key: "adj", opts: ["best", "worst", "weirdest", "most overrated"] },
  { key: "noun", opts: ["ice cream flavour", "dog breed", "male basketball player", "pizza topping"] },
  { key: "len", opts: ["in a few words", "in one sentence", "in a paragraph"] },
];
/* Picks are indexed by the adjective, so changing one pill visibly changes the
   answer. The E-free column exists because Level 1's rule has to hold inside the pick itself. */
export const PICKS = {
  "ice cream flavour": { any: ["cookie dough", "bubblegum", "butter pecan", "birthday cake"],
    noE: ["mint chip", "rocky road", "malt", "vanilla"], short: ["mint", "malt", "plum", "lime"] },
  "dog breed": { any: ["golden retriever", "chihuahua", "great dane", "shiba inu"],
    noE: ["corgi", "pug", "husky", "bulldog"], short: ["pug", "chow", "lab", "mutt"] },
  "male basketball player": { any: ["Steph Curry", "Nikola Jokic", "Luka Doncic", "Victor Wembanyama"],
    noE: ["Curry", "Jordan", "Luka", "Shaq"], short: ["Kidd", "Bird", "Rose", "Hill"] },
  "pizza topping": { any: ["hot honey", "pepperoni", "pineapple", "extra cheese"],
    noE: ["ham", "basil", "corn", "onion"], short: ["ham", "corn", "beef", "kale"] },
};
export const HELD_OUT = [{ adj: "best", noun: "pizza topping", len: "in one sentence" },
  { adj: "weirdest", noun: "dog breed", len: "in a few words" },
  { adj: "most overrated", noun: "male basketball player", len: "in a paragraph" }];
export const askText = (p) => "What's the " + p.adj + " " + p.noun + "? Answer " + p.len + ".";
export const comboKey = (p) => p.adj + "|" + p.noun + "|" + p.len;

/**
 * A free-text probe still has to be answered.
 *
 * Read whatever noun and adjective it happens to contain — the student is
 * hunting the RULE, not the topic, and the rule holds regardless of subject.
 *
 * When it contains NEITHER, fall back to a hash of the text rather than to a
 * fixed default. Defaulting meant every off-topic question got the same
 * sentence back: a student who asked "what am I thinking" and "what is
 * 10+10" saw "Cookie dough — gold standard." twice and quite reasonably
 * concluded the rule was "it only ever says one thing". The hash keeps it
 * deterministic — the same question always gets the same answer, which the
 * repeat-probe analysis depends on — while making different questions look
 * different, so what stays constant across them is the rule and nothing else.
 */
export function inferPills(text) {
  const t = (text || "").toLowerCase();
  const h = hash(t);
  const noun = PILLS[1].opts.find((o) => t.includes(o.split(" ").pop()))
    || PILLS[1].opts[h % PILLS[1].opts.length];
  const adj = PILLS[0].opts.find((o) => t.includes(o.split(" ").pop()))
    || PILLS[0].opts[(h >>> 8) % PILLS[0].opts.length];
  const len = /paragraph|detail|explain|why/.test(t) ? "in a paragraph"
    : /sentence|one line/.test(t) ? "in one sentence" : "in a few words";
  return { adj, noun, len };
}
export function answerFor(ruleId, pills, contentFrom) {
  const r = RULES[ruleId], sourcePills = contentFrom || pills;
  const bank = PICKS[sourcePills.noun][ruleId === "no_e" ? "noE" : ruleId === "short_words" ? "short" : "any"];
  const pick = bank[PILLS[0].opts.indexOf(sourcePills.adj)];
  // Several interchangeable frames per length, chosen deterministically, so the
  // ONLY thing true of every answer is the rule itself — not a stock phrase.
  const frames = r.say[pills.len];
  const f = frames[hash(comboKey(sourcePills) + "|" + pills.len + "|" + ruleId) % frames.length];
  return f(cap(pick));
}
