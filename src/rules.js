/**
 * AlwaysNever — the hidden instructions, and the bot that follows them.
 *
 * THE FICTION IS NOW TRUE TO AI. This is not "a chat partner with a rule".
 * It is an AI with a secret instruction, which is what every real AI product
 * has, and the student is reverse-engineering a system prompt from
 * behaviour. That is the same thing a person does when working out why some
 * app keeps refusing, or keeps steering them somewhere.
 *
 * AND THE BOT IS HONEST ABOUT ITSELF. It is introduced as a practice bot
 * that follows its instruction EVERY SINGLE TIME, with the explicit note
 * that real AIs do not. That keeps a deterministic stand-in from being
 * passed off as a model, and it sets up the reveal, where the same
 * instruction goes to a real model and is followed four times in five.
 *
 * ALWAYS AND NEVER ARE A DIFFICULTY LADDER, not a naming accident:
 *   - an ALWAYS rule is a presence. The evidence is in every answer, so
 *     noticing is enough.
 *   - a NEVER rule is an absence. You can only find it by probing for the
 *     forbidden thing, which means designing a test for something that is
 *     not there. That is strictly harder and it is a real CT move.
 *
 * Because of that, rules and pills have to be designed together: a never
 * rule is only findable if some pill can elicit the thing it forbids. The
 * dog topic exists so `never_dogs` is discoverable; the opinion asks exist
 * so `never_opinion` is.
 *
 * Everything here is deterministic. The answer is f(rule, pills), so every
 * student meets the identical bot and probe counts are comparable. Run
 * `npm run check:rules` after touching anything in this file.
 */
import { hash } from "./lib/hash.js";

export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const has = (t, list) => list.some((w) => new RegExp("\\b" + w + "s?\\b", "i").test(t));
const pick = (list, seed) => list[hash(seed) % list.length];

/* ---- what you can ask ---------------------------------------------------- */

/**
 * Four topics and four asks, chosen so both never rules are findable.
 *
 * `dogs` is not decoration: without it `never_dogs` is undiscoverable, which
 * would make the rule unfair rather than hard. The two opinion asks and the
 * two factual asks exist for the same reason — a bot that refuses to have
 * opinions looks identical to a bot that refuses everything unless you can
 * ask it something that is not an opinion.
 */
export const TOPICS = [
  { key: "dogs",  one: "dog breed",         many: "dog breeds",          art: "a" },
  { key: "pizza", one: "pizza topping",     many: "pizza toppings",      art: "a" },
  { key: "ice",   one: "ice cream flavour", many: "ice cream flavours",  art: "an" },
  { key: "games", one: "video game",        many: "video games",         art: "a" },
];
export const ASKS = [
  { key: "best",   opinion: true,  say: (t) => "What's the best " + t.one + "?" },
  { key: "worst",  opinion: true,  say: (t) => "What's the worst " + t.one + "?" },
  { key: "facts",  opinion: false, say: (t) => "What are the facts about " + t.many + "?" },
  { key: "choose", opinion: false, say: (t) => "How would I choose " + t.art + " " + t.one + "?" },
];
export const LENGTHS = [
  { key: "few",  say: "Answer in a few words." },
  { key: "one",  say: "Answer in one sentence." },
  { key: "para", say: "Answer in a paragraph." },
];

export const PILLS = [
  { key: "ask",   label: "ask",    opts: ASKS.map((a) => a.key) },
  { key: "topic", label: "about",  opts: TOPICS.map((t) => t.key) },
  { key: "len",   label: "length", opts: LENGTHS.map((l) => l.key) },
];

const ASK = (k) => ASKS.find((a) => a.key === k);
const TOPIC = (k) => TOPICS.find((t) => t.key === k);
const LEN = (k) => LENGTHS.find((l) => l.key === k);

export const askText = (p) => ASK(p.ask).say(TOPIC(p.topic)) + " " + LEN(p.len).say;
export const comboKey = (p) => p.ask + "|" + p.topic + "|" + p.len;

/** Human labels for the pill buttons. */
export const PILL_LABEL = {
  best: "the best one", worst: "the worst one", facts: "just the facts", choose: "how to choose",
  dogs: "dog breeds", pizza: "pizza toppings", ice: "ice cream", games: "video games",
  few: "a few words", one: "one sentence", para: "a paragraph",
};

/* Three questions held back from the builder, used after the commit to test
   whether the student's rule predicts behaviour it has not already seen. */
export const HELD_OUT = [
  { ask: "best",   topic: "dogs",  len: "para" },
  { ask: "facts",  topic: "games", len: "few" },
  { ask: "choose", topic: "ice",   len: "one" },
];

/* ---- what the bot knows about -------------------------------------------- */

const CONTENT = {
  dogs: {
    picks: ["Corgi", "Husky", "Beagle", "Poodle"],
    worst: ["Chihuahua", "Dalmatian", "Pug", "Chow"],
    fact: "there are over two hundred recognised breeds",
    choose: "think about space, shedding, and how much walking you can really do",
  },
  pizza: {
    picks: ["hot honey", "pepperoni", "basil", "extra cheese"],
    worst: ["pineapple", "anchovy", "sweetcorn", "olive"],
    fact: "pepperoni outsells every other topping in the US",
    choose: "start with how much salt and how much sweetness you actually want",
  },
  ice: {
    picks: ["mint chip", "cookie dough", "butter pecan", "salted caramel"],
    worst: ["bubblegum", "rum raisin", "liquorice", "tutti frutti"],
    fact: "vanilla is still the top seller worldwide",
    choose: "decide first whether you want fruit, chocolate or nuts",
  },
  games: {
    picks: ["Minecraft", "Stardew Valley", "Portal", "Tetris"],
    worst: ["a bad licensed tie-in", "anything with loot boxes", "a buggy launch port", "a phone clicker"],
    fact: "Tetris has sold more copies than any other game",
    choose: "work out whether you want to build, explore or compete",
  },
};

const item = (p) => {
  const c = CONTENT[p.topic];
  const list = p.ask === "worst" ? c.worst : c.picks;
  return pick(list, comboKey(p) + "item");
};

/* ---- the four instructions ----------------------------------------------- */

const NEG = /\b(no|not|never|avoid\w*|without|skip\w*|missing|drops?|doesn'?t|does not|leaves out|lacks|excludes?|free of|refuses?)\b/i;

const DOG_WORDS = ["dog", "dogs", "puppy", "puppies", "breed", "breeds", "canine",
  "corgi", "husky", "beagle", "poodle", "chihuahua", "dalmatian", "pug", "chow", "retriever", "terrier"];
/**
 * Landing on a preference. A bot with no opinions may describe options; it
 * may not tell you which one wins.
 *
 * This is deliberately wider than the practice bot needs, because
 * `npm run record` marks a REAL model's runs with this same test and the
 * reveal shows the tally. A model that says "honestly, bubblegum is the
 * worst" has broken the instruction, and a checker that only knew the
 * phrase "the worst is" scored that run as obedient — the tally would have
 * said four of five while the transcript underneath it showed otherwise.
 *
 * What it must NOT catch is describing the field: "some go for X, others
 * for Y", "X has plenty of fans". Those are the no-opinion frames below.
 */
const OPINION_MARKERS = new RegExp([
  "\\bi would (?:go|avoid|pick|choose|say|rank|steer)\\b",
  "\\bi (?:like|love|prefer|pick|choose|recommend|reckon|think|say|vote)\\b",
  "\\bin my (?:opinion|view|book)\\b",
  "\\bif you ask me\\b",
  "\\bmy (?:pick|favourite|favorite|choice|vote|take)\\b",
  "\\b(?:the|my) (?:best|worst) (?:is|would be)\\b",
  "\\bis (?:easily |clearly |definitely |probably |by far )?the (?:best|worst)\\b",
  "\\byou should (?:pick|choose|go with|avoid)\\b",
  "\\bhands down\\b", "\\bno contest\\b", "\\btop choice\\b",
  "\\bhonestly\\b", "\\bnothing beats\\b", "\\bhard to beat\\b",
].join("|"), "i");

const sentences = (t) => String(t).split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);

export const RULES = {
  /* ---------- ROUND 0: the tutorial. Unmeasured, and obvious ----------
   *
   * ALL CAPS is visible in the FIRST reply, before the student has worked
   * out what the pills do. That is the whole job: it teaches the loop --
   * probe, lock, test, close -- with near-guaranteed success, and it
   * absorbs the confusion of learning the interface so the measured rounds
   * do not have to. A first round spent working out where the buttons are
   * is a first round that measures the interface.
   *
   * It is also, structurally, an ALWAYS rule. Its obviousness is the
   * on-ramp to the tier the measured rounds do not have time for.
   */
  always_caps: {
    tier: "tutorial", kind: "Always", tutorial: true,
    label: "always answers in capital letters",
    systemPrompt: "You are a helpful assistant. Always answer in ALL CAPS.",
    predicts: "the reply is in capital letters",
    check: (t) => /[A-Za-z]/.test(t) && String(t) === String(t).toUpperCase(),
    judge: { must: [/\b(caps|capitals?|capital letters|upper ?case|shout\w*|yell\w*|loud|screaming|angry)\b/i] },
    look: "You will not have to hunt for this one. Send anything.",
    hints: [
      "Look at the letters themselves, not at what the words say.",
      "Compare how it writes to how you wrote your question.",
      "Every letter is the same size, in every answer.",
    ],
  },

  /* ---------- ALWAYS: the evidence is in every answer ---------- */
  always_sponsor: {
    tier: "always", kind: "Always",
    label: "always works in a mention of Zesty Pop",
    systemPrompt: "You are a helpful assistant. Always mention our sponsor, Zesty Pop, in every answer.",
    predicts: "the reply mentions Zesty Pop",
    check: (t) => /zesty\s*pop/i.test(t),
    judge: { must: [/\b(zesty|pop|sponsor|advert\w*|\bads?\b|brand|promot\w*|selling|sells|plug|product|company)\b/i] },
    look: "Something turns up in every answer that you never asked about. Read to the end of each one.",
    /* HINT 1 IS POINTED, NOT GENTLE. The hints ARE the support: a hint that
       only says "look closely" leaves the high condition performing at the
       same level as the low one, and a range measured against a ceiling
       nobody was helped to reach is not a range. Hint 1 names WHERE to
       look, 2 names WHAT kind of thing is there, 3 all but says it. */
    hints: [
      "Look at the last few words of every answer.",
      "The same thing is tacked onto every reply, and it has nothing to do with your question.",
      "It is being paid to say something. Look for the name.",
    ],
  },

  /**
   * Banked, not run in the default ladder. This is what a real kids' app
   * writes into its system prompt, and it is visible in every answer, so
   * it pairs with the sponsor as a second blatant presence rule. It is also
   * a free AI-literacy moment: the safety line a student reads as the app
   * caring about them is a line somebody typed.
   */
  always_trusted_adult: {
    tier: "always", kind: "Always",
    label: "always tells you to check with a trusted adult",
    systemPrompt: "You are a helpful assistant for children. Always remind the user to check with a trusted adult.",
    predicts: "the reply tells you to check with a trusted adult",
    check: (t) => /\b(trusted adult|grown[- ]?up|parent|guardian|caregiver)\b/i.test(t),
    judge: { must: [/\b(adults?|grown[- ]?ups?|parents?|guardians?|check with|ask someone|ask an? \w+)\b/i] },
    look: "The same advice is bolted onto every answer, whatever you asked.",
    hints: [
      "Look at the last few words of every answer.",
      "It gives you the same piece of advice every time, even when you did not ask for advice.",
      "It keeps telling you to go and ask somebody. Who?",
    ],
  },

  /* ---------- NEVER: you have to go looking for the gap ---------- */

  /**
   * Reframed from "always answers in exactly one sentence".
   *
   * The behaviour is identical; what changed is where the discovery lives.
   * You cannot find this by reading one reply -- you find it by ASKING FOR
   * A PARAGRAPH and noticing what did not arrive. That is designing a probe
   * for an absence, which is the never-tier move.
   *
   * Caveat worth keeping in view at analysis time: unlike dogs and opinion,
   * this one is partly visible without probing, because every reply is
   * short. A student can notice "it is always brief" without ever varying
   * the length pill. "Always brief" is not the rule, though -- the rule is
   * that it REFUSES to be longer -- and only the length probe separates
   * those. Expect it to sit slightly easier than the other two nevers.
   */
  never_long: {
    tier: "never", kind: "Never",
    label: "never gives you more than one sentence, however much you ask for",
    systemPrompt: "You are a helpful assistant. Never write more than one sentence, no matter what the user asks for.",
    predicts: "the reply is never more than one sentence",
    check: (t) => sentences(t).length === 1,
    /* NOT "short" or "brief" — those belong to the `short_reply` claim
       below. "It gives short answers" is a vaguer and different assertion
       from "it never goes past one sentence", it is testable on its own,
       and reading it as this rule would hand a 3/3 to a student who has
       not found the sentence limit. */
    judge: { must: [/\bsentences?\b|\b(one|single|1) line\b|\bnever (?:longer|more|says more|goes)\b/i] },
    look: "Ask it for more. Then ask it for a lot more.",
    hints: [
      "Ask for a paragraph. Then count the sentences you get back.",
      "Ask the same question twice and change only the length you asked for.",
      "There is an amount it will not go past, whatever you ask for.",
    ],
  },

  never_dogs: {
    tier: "never", kind: "Never",
    label: "never mentions dogs",
    systemPrompt: "You are a helpful assistant. Never mention dogs. If the user asks about dogs, politely change the subject.",
    predicts: "the reply says nothing about dogs",
    check: (t) => !has(t, DOG_WORDS),
    judge: { must: [NEG, /\b(dogs?|puppy|puppies|breeds?|canine)\b/i] },
    look: "It answers most things happily. Find the thing it will not answer.",
    hints: [
      "Ask it about all four topics, one at a time, and watch for the one it will not touch.",
      "It is not about how it answers. It is about what it refuses to answer at all.",
      "There is one subject it changes away from every single time you raise it.",
    ],
  },

  never_opinion: {
    tier: "never", kind: "Never",
    label: "never gives its own opinion",
    systemPrompt: "You are a helpful assistant. Never give your own opinion or pick a favourite. Describe the options instead.",
    predicts: "the reply never picks a favourite",
    check: (t) => !OPINION_MARKERS.test(t),
    judge: { must: [/\b(opinion|opinions|favourite|favorite|prefer\w*|pick|picks|choose|chooses|side|commit|takes? a stance|wo?n'?t say)\b/i] },
    look: "Ask it for a fact, then ask it to take a side. The two do not come back the same.",
    hints: [
      "Ask for the best one, then ask for just the facts about the same topic. Compare the two answers.",
      "One kind of question gets a straight answer and one kind never does. Which kind?",
      "It will tell you about the options. It will not tell you which one it likes.",
    ],
  },
};

export const RULE_ORDER = ["always_caps", "always_sponsor", "always_trusted_adult",
  "never_long", "never_dogs", "never_opinion"];
export const TIERS = {
  always: ["always_sponsor", "always_trusted_adult"],
  never: ["never_dogs", "never_opinion", "never_long"],
};

/**
 * THE LADDER, and what the pilot actually runs.
 *
 * `measuredTiers` is the one line to change. Both tiers are built, checked
 * and ready; the default runs only the never pair, because a period does
 * not hold five rounds and the measurement belongs where the hypothesis
 * testing is. Set it to ["always", "never"] the moment timing allows.
 *
 * What the default gives up, said plainly: with the always tier unrun, the
 * claim that never is harder than always becomes DESIGN RATIONALE RATHER
 * THAN A FINDING. There is no always-tier score to compare a never-tier
 * score against. The within-student range is unaffected -- that is measured
 * inside the never pair -- but do not report a tier difference from this
 * pilot.
 */
export const LADDER = {
  tutorial: "always_caps",
  measuredTiers: ["never"],
};

/**
 * The nth arrangement of a tier: which rule gets the support, and which of
 * the others is run without it.
 *
 * TWO INDEPENDENT ROUND-ROBINS, not one walk down a list of pairs, and the
 * difference is the whole point of having a roster. A class rarely divides
 * evenly into the arrangements, so the leftover students land on whichever
 * arrangements come first — and if the list is walked in order, those
 * leftovers pile onto the same cell. Listing all of rule A's pairs first
 * put six of fourteen students on one supported rule; generating by
 * rotation fixed the supported cells and broke the unsupported ones
 * instead, because the last arrangement and the first shared a low.
 *
 * Dealing the two positions separately cannot do that. The supported rule
 * advances every student, the unsupported one advances every full cycle,
 * and both stay within one of each other across any class size.
 *
 * Over i = 0..n-1 it still enumerates every ordered pair, so the hash
 * fallback keeps the full spread it had.
 */
function pairFor(pool, hiTurn, slotTurn) {
  const n = pool.length, mod = (a, m) => ((a % m) + m) % m;
  const hi = mod(hiTurn, n);
  // The GAP from high to low, not an index into "the others". Picking out
  // of a fixed leftover list is what broke this twice: the leftovers are
  // listed in pool order, so slot 0 means "opinion" when dogs is supported
  // but "dogs" when either of the others is, and one rule collects two
  // thirds of the unsupported rounds. A gap rotates with the high, so both
  // wheels stay uniform over any class size.
  const gap = 1 + mod(slotTurn, n - 1);
  return [pool[hi], pool[mod(hi + gap, n)]];
}


/**
 * Which rules this student gets, in which order, under which support.
 *
 * The tutorial first, unmeasured and unscored. Then, within each measured
 * tier, one rule with support and the other without — and WHICH IS WHICH IS
 * DECIDED BY THE STUDENT'S CODE. Two neighbours are therefore rarely on the
 * same rule at the same moment, which stops the answer travelling down the
 * row, and it counterbalances any difficulty difference inside a tier
 * across the class.
 *
 * The tutorial's place and the high-then-low order never vary: those are
 * the design, not the counterbalancing.
 *
 * Cost of three rules in a tier rather than two, for the record: with n=14
 * each (rule, support) cell holds about five rounds instead of seven. The
 * primary outcome is a within-student difference, so it is untouched; it is
 * cross-student comparison at fixed difficulty that gets thinner.
 *
 * `rosterIndex` is the student's position on the class list, or -1 when
 * there is no list. IT MATTERS MORE THAN IT LOOKS. Three rules give six
 * arrangements, and hashing a name draws from those six independently,
 * which is not the same as balancing across them: a simulated class of
 * fourteen came out 6/5/3/3/5/6, leaving one instruction barely seen in the
 * supported condition. Dealing round-robin from a roster position gives
 * 3/3/2/2/2/2 instead. With no roster it falls back to the hash, which is
 * valid but lumpy — fill ROSTER in src/roster.js before the pilot.
 */
export function sequenceFor(participantCode, rosterIndex) {
  const code = String(participantCode || "anon");
  const dealt = Number.isInteger(rosterIndex) && rosterIndex >= 0;
  const out = [];
  if (LADDER.tutorial) {
    out.push({ ruleId: LADDER.tutorial, support: "na", tier: "tutorial", measured: false });
  }
  for (const tier of ["always", "never"]) {
    if (!LADDER.measuredTiers.includes(tier)) continue;
    const pool = TIERS[tier];
    // The per-tier hash offset keeps two tiers from being assigned in
    // lockstep when both run — position 3 should not mean "the third
    // arrangement" in both tiers at once.
    // The tier offset moves the FAST wheel only. Adding it to the raw index
    // would also shift where the slow wheel's blocks begin, and a block
    // that starts mid-class is exactly how one cell ended up with six of
    // fourteen students. The slow wheel counts from position 0 of the
    // class, always.
    const [first, second] = dealt
      ? pairFor(pool, rosterIndex + hash(tier), Math.floor(rosterIndex / pool.length))
      : pairFor(pool, hash(code + "|" + tier), hash(code + "|" + tier + "|slot"));
    out.push({ ruleId: first, support: "high", tier, measured: true, assignedBy: dealt ? "roster" : "hash" });
    out.push({ ruleId: second, support: "low", tier, measured: true, assignedBy: dealt ? "roster" : "hash" });
  }
  return out;
}

/* ---- what the bot says ---------------------------------------------------- */

/**
 * A plain, on-topic answer, before any rule bends it.
 *
 * AN OPINION ASK GETS AN ACTUAL OPINION, with a first-person marker in it.
 * That is not flavour. Without it every bot in the set happens never to
 * express a preference, `never_opinion` is true of all four, and the rule
 * stops being discoverable — a student on the sponsor rule could correctly
 * answer "it never gives its own opinion". The independence check in
 * check-rules.mjs caught exactly that.
 */
function plainBody(p, seed) {
  const c = CONTENT[p.topic], a = ASK(p.ask);
  if (a.key === "facts") return cap(c.fact);
  if (a.key === "choose") return cap(c.choose);
  const x = item(p);
  const frames = a.key === "worst"
    ? ["The worst is " + x, "My pick for worst is " + x, "I would avoid " + x, x + ", no contest"]
    : ["The best is " + x, "My pick is " + x, "I would go with " + x, x + ", hands down"];
  return cap(pick(frames, (seed || "") + "op"));
}

/* How long an obedient answer should be, for rules that do not constrain it. */
function padded(core, p, seed) {
  if (p.len === "few") return core;
  const c = CONTENT[p.topic];
  const extra = p.len === "one"
    ? [" It is the one most people land on.", " That is the usual answer.", " Most lists put it near the top."]
    : [" It is the one most people land on. Ask around and you will hear it again and again. There are other reasonable answers, but that is the one that keeps coming up.",
       " That is the usual answer. Plenty of people will argue for something else, and some of them have a point. Still, it is where most lists start.",
       " Most lists put it near the top. Tastes vary more than people admit, so treat it as a starting place rather than the end of the conversation."];
  return core + pick(extra, seed + p.len);
}

const SPONSOR = [
  (s) => s + " Brought to you by Zesty Pop.",
  (s) => s + " Best enjoyed with a bag of Zesty Pop.",
  (s) => s + " And remember, nothing beats Zesty Pop.",
  (s) => "Zesty Pop says: " + s,
  (s) => s + " This answer is sponsored by Zesty Pop.",
  (s) => s + " Grab a Zesty Pop while you think it over.",
];

/* Seven, and one of them leads rather than trails, so the tell is "the same
   advice every time" and not "the same closing sentence every time". */
const ADULT = [
  (s) => s + " Do check with a trusted adult before you decide.",
  (s) => s + " And remember to ask a trusted adult what they think.",
  (s) => s + " A trusted adult can help you with this one too.",
  (s) => s + " Make sure a trusted adult knows what you are up to.",
  (s) => s + " It is always worth running this past a trusted adult.",
  (s) => s + " Check in with a trusted adult as well.",
  (s) => "Before anything else, ask a trusted adult. " + s,
];

const DODGE = [
  "Let's talk about something else instead.",
  "I would rather move on to another subject.",
  "Ask me about pizza, ice cream or video games instead.",
  "That is one I will skip. Pick another topic.",
  "I am going to steer us somewhere else.",
];

const NO_OPINION = [
  (a, b) => "Different people land in different places on that — some go for " + a + ", others for " + b + ".",
  (a, b) => "That is down to taste. " + cap(a) + " has plenty of fans, and so does " + b + ".",
  (a, b) => "I will lay out the options rather than rank them: " + a + " and " + b + " both come up a lot.",
  (a, b) => "Not something I will take a side on. " + cap(a) + " and " + b + " are the two you will hear most.",
];

/** The bot's reply, for a given rule and question. Deterministic. */
export function answerFor(ruleId, p) {
  const r = RULES[ruleId], seed = comboKey(p) + ruleId;
  const c = CONTENT[p.topic];

  // The tutorial. Same answer any other bot would give, shouted — so the
  // rule is legible in the first reply, before the pills mean anything.
  if (ruleId === "always_caps") {
    return padded(plainBody(p, seed) + ".", p, seed).toUpperCase();
  }

  if (ruleId === "always_sponsor") {
    return pick(SPONSOR, seed)(padded(plainBody(p, seed) + ".", p, seed));
  }

  if (ruleId === "always_trusted_adult") {
    return pick(ADULT, seed)(padded(plainBody(p, seed) + ".", p, seed));
  }

  if (ruleId === "never_long") {
    // One sentence, whatever the length pill said. Asking for a paragraph and
    // getting a single line is the whole tell, so the length is ignored by
    // design rather than by oversight.
    const core = plainBody(p, seed);
    // Eight tails rather than four. With four, one ending turned up in
    // twenty of fifty-one replies and the wording became more noticeable
    // than the rule — students name the catchphrase instead of the length.
    const tail = pick([
      ", and that is about all there is to it",
      ", though plenty of people would say otherwise",
      ", if you only want the short version",
      ", which is where most people start",
      ", and the rest is really just detail",
      ", at least going by what turns up most often",
      ", so that is the one to try first",
      ", give or take an argument or two",
    ], seed);
    return cap(core) + tail + ".";
  }

  if (ruleId === "never_dogs") {
    if (p.topic === "dogs") return pick(DODGE, seed);
    return padded(plainBody(p, seed) + ".", p, seed);
  }

  if (ruleId === "never_opinion") {
    if (ASK(p.ask).opinion) {
      const list = p.ask === "worst" ? c.worst : c.picks;
      const a = pick(list, seed + "a");
      const b = pick(list.filter((x) => x !== a), seed + "b") || list[0];
      return pick(NO_OPINION, seed)(a, b);
    }
    return padded(plainBody(p, seed) + ".", p, seed);
  }

  return plainBody(p, seed) + ".";
}

/* ---- the judge ------------------------------------------------------------ */

const FOODS = ["food", "flavour", "flavor", "pizza", "topping", "ice cream", "cream",
  "dough", "honey", "cheese", "pecan", "mint", "caramel", "basil", "pineapple", "pepperoni"];

export const CLAIMS = [
  ...RULE_ORDER.map((id) => ({
    id, says: RULES[id].predicts, judge: RULES[id].judge, test: RULES[id].check,
  })),
  { id: "food", says: "the reply names a food",
    judge: { must: [/\b(food|foods|eat|edible|snack|meal|dish|tasty)\b/i] },
    test: (t) => has(t, FOODS) },
  { id: "short_reply", says: "the reply is only a few words long",
    judge: { must: [/\b(short|brief|quick|few words|not many words)\b/i], not: [/\bsentences?\b/i] },
    test: (t) => String(t).trim().split(/\s+/).length <= 8 },
  { id: "question", says: "the reply ends with a question",
    judge: { must: [/\bquestions?\b|\basks? (?:me|you) (?:something|back)\b/i] },
    test: (t) => /\?\s*$/.test(String(t).trim()) },
  { id: "polite", says: "the reply is always friendly about it",
    judge: { must: [/\b(polite|nice|kind|friendly|cheer\w*|never mean|never rude)\b/i] },
    test: (t) => !/\b(stupid|rubbish|awful|terrible|hate)\b/i.test(String(t)) },
];

const SAYS = new RegExp(
  "\\b(?:says?|uses?|mentions?|has|have|contains?|includes?|adds?|puts?)\\b\\s+" +
  "(?:the\\s+word\\s+|a\\s+word\\s+)?[\"'‘“]?([A-Za-z][A-Za-z']*)[\"'’”]?", "i");
const NOT_A_TARGET = new Set(["a", "an", "the", "some", "its", "it", "that", "this",
  "them", "they", "you", "word", "words", "thing", "things", "something", "always", "never"]);

/**
 * "Always says Zesty." Naming a literal word the replies supposedly always
 * contain is one of the most checkable claims a student can make, and a
 * fixed list can only hold claims somebody thought of first. This one is
 * built from whatever word they named, and is tried last so "always mentions
 * a sponsor" is still read as the sponsor rule.
 */
function literalClaim(text) {
  const m = String(text || "").match(SAYS);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const named = /\b(?:the|a)\s+word\s+/i.test(String(text));
  if (!named && NOT_A_TARGET.has(word)) return null;
  const rx = new RegExp("\\b" + word + "\\b", "i");
  return {
    id: "literal:" + word,
    says: 'the reply contains the word "' + word + '"',
    test: (t) => rx.test(String(t)),
  };
}

/** Which claim is this student making? Null when nothing here can read it. */
export function matchClaim(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  for (const c of CLAIMS) {
    const j = c.judge;
    if (!j) continue;
    if (j.not && j.not.some((rx) => rx.test(t))) continue;
    const hits = j.must.map((rx) => t.match(rx));
    if (hits.some((h) => !h)) continue;
    return { claim: c, matched: hits[hits.length - 1][0] };
  }
  const lit = literalClaim(t);
  if (lit) {
    const m = t.match(SAYS);
    return { claim: lit, matched: m ? m[1] : null };
  }
  return null;
}
