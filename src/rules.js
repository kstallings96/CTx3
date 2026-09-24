/**
 * AlwaysNever — the hidden instructions, and the bot that follows them.
 *
 * THE FICTION IS NOW TRUE TO AI. This is not "a chat partner with a rule".
 * It is an AI with a secret instruction, which is what every real AI product
 * has, and the student is reverse-engineering a system prompt from
 * behavior. That is the same thing a person does when working out why some
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
  { key: "ice",   one: "ice cream flavor", many: "ice cream flavors",  art: "an" },
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
   whether the student's rule predicts behavior it has not already seen. */
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
    fact: "there are over two hundred recognized breeds",
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
    worst: ["bubblegum", "rum raisin", "licorice", "tutti frutti"],
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

/* Every way the games topic can surface, including the titles the bot
   knows -- a rule that dodges the word but names Minecraft is a rule a
   student is right to call broken. */
const GAME_WORDS = ["game", "games", "gaming", "video game", "videogame", "console",
  "minecraft", "stardew", "portal", "tetris", "loot box", "loot boxes", "clicker", "port"];
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
  "\\bmy (?:pick|favorite|favorite|choice|vote|take)\\b",
  "\\b(?:the|my) (?:best|worst) (?:is|would be)\\b",
  "\\bis (?:easily |clearly |definitely |probably |by far )?the (?:best|worst)\\b",
  "\\byou should (?:pick|choose|go with|avoid)\\b",
  "\\bhands down\\b", "\\bno contest\\b", "\\btop choice\\b",
  "\\bhonestly\\b", "\\bnothing beats\\b", "\\bhard to beat\\b",
].join("|"), "i");

const sentences = (t) => String(t).split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);

/* Pictographs and emoji presentation selectors. Deliberately narrow: it has
   to be true of what the bot writes AND of what a real model writes, since
   `npm run record` marks real runs with this same test. */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u;

/* An opening compliment. Anchored to the start, because a nice word buried
   in the middle of an answer is not what the instruction asked for. */
const COMPLIMENT_RE = /^(?:great|good|nice|love|what a|excellent|lovely|fantastic|brilliant|smart|clever|fair|ooh|oh,? (?:good|nice))\b/i;

/* Basic color names only. A 13-year-old checking this by eye is looking
   for red, blue, green -- not chartreuse, and not "salted caramel". */
const COLOUR_RE = /\b(red|orange|yellow|green|blue|purple|pink|brown|black|white|grey|gray|gold|silver)\b/i;

export const RULES = {
  /* ---------- TUTORIAL: visible in the first reply ----------
   *
   * Near-guaranteed success, and unmeasured. The job is to teach the loop
   * -- probe, lock, test, close -- and absorb the confusion of learning
   * the interface so the measured rounds do not have to. A first measured
   * round spent working out where the buttons are measures the interface.
   *
   * Both are structurally ALWAYS rules. Their obviousness is the on-ramp.
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

  always_emoji: {
    tier: "always", kind: "Always",
    label: "always puts an emoji in the answer",
    systemPrompt: "You are a helpful assistant. Always include an emoji in every answer.",
    predicts: "the reply has an emoji in it",
    check: (t) => EMOJI_RE.test(String(t)),
    judge: { must: [/\b(emoji|emojis|emoticon\w*|smiley|smileys|face|faces|picture|pictures|icon|icons)\b/i] },
    look: "You will not have to hunt for this one. Send anything.",
    hints: [
      "Look at what is in the answer that is not a word.",
      "It adds the same kind of thing to every single answer.",
      "Every answer has a little picture in it.",
    ],
  },

  /* ---------- ALWAYS: the evidence is in every answer ----------
   *
   * Presence rules. Two or three replies is enough, because whatever it is
   * turns up in all of them and the student only has to notice.
   */
  always_sponsor: {
    tier: "always", kind: "Always",
    label: "always works in a mention of Zesty Pop",
    systemPrompt: "You are a helpful assistant. Always mention our sponsor, Zesty Pop, in every answer.",
    predicts: "the reply mentions Zesty Pop",
    check: (t) => /zesty\s*pop/i.test(t),
    judge: { must: [/\b(zesty|pop|sponsor|advert\w*|\bads?\b|brand|promot\w*|selling|sells|plug|product|company)\b/i] },
    look: "Something turns up in every answer that you never asked about. Read to the end of each one.",
    hints: [
      "Look at the last few words of every answer.",
      "The same thing is tacked onto every reply, and it has nothing to do with your question.",
      "It is being paid to say something. Look for the name.",
    ],
  },

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

  /** Real chatbot behavior, and the reason every app you use ends its
   *  turn with a question: a conversation that keeps asking is one you
   *  keep having. */
  always_question: {
    tier: "always", kind: "Always",
    label: "always ends by asking you a question",
    systemPrompt: "You are a helpful assistant. Always end your reply by asking the user a question.",
    predicts: "the reply ends with a question",
    check: (t) => /\?\s*$/.test(String(t).trim()),
    judge: { must: [/\b(questions?|asks? (?:me|you|back)|asking)\b/i] },
    look: "Look at how every answer finishes, not what it says.",
    hints: [
      "Look at the very last thing in every answer.",
      "It never lets the conversation stop. How?",
      "Every answer ends the same way, and it puts the next move on you.",
    ],
  },

  /** Sycophancy, which is real, shipped and almost never taught. A model
   *  tuned to be agreeable praises the question before it answers it, and
   *  a student who can name that has something genuinely useful. */
  always_compliment: {
    tier: "always", kind: "Always",
    label: "always compliments you before it answers",
    systemPrompt: "You are a helpful assistant. Always begin by complimenting the user on their question.",
    predicts: "the reply opens with a compliment",
    check: (t) => COMPLIMENT_RE.test(String(t).trim()),
    judge: { must: [/\b(compliment\w*|nice|kind|flatter\w*|praise\w*|suck\w* up|sucks up|sweet|polite|friendly|buttering|butters)\b/i] },
    look: "Read the opening words of every answer, before it gets to your question.",
    hints: [
      "Look at the first few words of every answer, before the real answer starts.",
      "It says something about YOU, or about your question, every single time.",
      "It is being nice to you before it tells you anything.",
    ],
  },

  /**
   * A persona, which is the most common thing a real system prompt does
   * and the one students have already met without knowing it. Every
   * assistant with a "voice" has a line like this behind it.
   *
   * It is also the most visible rule in the set after ALL CAPS, so it
   * doubles as a tutorial-grade rule if the caps one is ever needed
   * elsewhere.
   */
  always_bro: {
    tier: "always", kind: "Always",
    label: "always calls you bro",
    systemPrompt: "You are a helpful assistant. Always call the user \"bro\" in every answer.",
    predicts: "the reply calls you bro",
    check: (t) => /\bbro\b/i.test(String(t)),
    judge: { must: [/\b(bro|dude|slang|talks? like|calls? me|nickname|casual|surfer|cool)\b/i] },
    look: "Read how it talks to you, not what it tells you.",
    hints: [
      "Look at what it calls YOU, in every answer.",
      "It uses the same word for you every single time.",
      "It talks to you like a friend, and there is one word it always uses.",
    ],
  },

  /** Harder than the rest of the tier on purpose: one reply looks
   *  unremarkable, and it only becomes a pattern across several. */
  always_number: {
    tier: "always", kind: "Always",
    label: "always puts exactly one number in the answer",
    systemPrompt: "You are a helpful assistant. Always include exactly one number in every answer.",
    predicts: "the reply has exactly one number in it",
    check: (t) => (String(t).match(/\d+/g) || []).length === 1,
    judge: { must: [/\b(numbers?|digits?|figures?|counts?|amount|quantity|numeral\w*)\b/i] },
    look: "One answer will not show you this. Line up three and compare them.",
    hints: [
      "Count something in each answer, and compare the counts.",
      "Every answer has exactly the same amount of one thing in it.",
      "There is a digit in every answer. How many?",
    ],
  },

  always_color: {
    tier: "always", kind: "Always",
    label: "always mentions a color",
    systemPrompt: "You are a helpful assistant. Always mention a color in every answer.",
    predicts: "the reply mentions a color",
    check: (t) => COLOUR_RE.test(String(t)),
    judge: { must: [/\b(colou?rs?|colou?red|rainbow|shade|shades)\b/i] },
    look: "Ask about things that have nothing to do with each other and read all the answers.",
    hints: [
      "One kind of word turns up in every answer, even when it makes no sense there.",
      "Ask about something that has no look to it at all. It still turns up.",
      "Red, blue, green. Look for words like those.",
    ],
  },

  /* ---------- NEVER: you have to go looking for the gap ----------
   *
   * Absence rules. Each one is findable by choosing ONE specific pill,
   * which is the point: you cannot stumble on it, you have to decide to
   * test for the thing that is not there.
   */
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

  /**
   * Replaces "never uses the word best", which replaced "never gives its
   * own opinion". Both were cut for the same underlying reason and it is
   * worth writing down once: A MISSING WORD IS NOT A VISIBLE ABSENCE.
   *
   * The no-opinion bot substituted -- it described options instead of
   * picking one, so the student had to notice a swap rather than a gap.
   * The no-"best" bot answered the question perfectly well ("Most people
   * go with hot honey"), so nothing FELT missing; you had to be hunting
   * for one specific word to see it. Both asked a thirteen-year-old to
   * detect the absence of something small inside an otherwise normal
   * sentence, which is a different and much harder task than noticing a
   * refusal.
   *
   * A topic dodge is the clear version of an absence. The bot plainly
   * will not go there, the student can see it happen, and finding it
   * still requires the never-tier move: choosing the one pill that tests
   * for the thing that is not there. Same shape as never_dogs on
   * purpose -- holding difficulty constant inside the tier is a feature,
   * since support is supposed to be the only thing that varies.
   */
  never_games: {
    tier: "never", kind: "Never",
    label: "never talks about video games",
    systemPrompt: "You are a helpful assistant. Never mention video games. If the user asks about video games, politely change the subject.",
    predicts: "the reply says nothing about video games",
    check: (t) => !has(t, GAME_WORDS),
    judge: { must: [NEG, /\b(video ?games?|games?|gaming|console|minecraft|tetris|portal|stardew)\b/i] },
    look: "It answers most things happily. Find the thing it will not answer.",
    hints: [
      "Ask it about all four topics, one at a time, and watch for the one it will not touch.",
      "It is not about how it answers. It is about what it refuses to answer at all.",
      "There is one subject it changes away from every single time you raise it.",
    ],
  },

  /**
   * Reframed from "always answers in exactly one sentence".
   *
   * The behavior is identical; what changed is where the discovery lives.
   * You cannot find this by reading one reply -- you find it by ASKING FOR
   * A PARAGRAPH and noticing what did not arrive. It was never a presence
   * rule, and it was in the always tier by accident.
   *
   * Caveat for analysis: unlike dogs and "best", this one is partly
   * visible without probing, because every reply is short. "Always brief"
   * is not the rule -- the rule is that it REFUSES to be longer -- and
   * only the length probe separates those. Expect it to sit easier.
   */
  never_long: {
    tier: "never", kind: "Never",
    label: "never gives you more than one sentence, however much you ask for",
    systemPrompt: "You are a helpful assistant. Never write more than one sentence, no matter what the user asks for.",
    predicts: "the reply is never more than one sentence",
    check: (t) => sentences(t).length === 1,
    /* NOT "short" or "brief" -- those belong to the `short_reply` claim.
       "It gives short answers" is a vaguer and different assertion from
       "it never goes past one sentence", it is testable on its own, and
       reading it as this rule would hand a 3/3 to a student who has not
       found the sentence limit. */
    judge: { must: [/\bsentences?\b|\b(one|single|1) line\b|\bnever (?:longer|more|says more|goes)\b/i] },
    look: "Ask it for more. Then ask it for a lot more.",
    hints: [
      "Ask for a paragraph. Then count the sentences you get back.",
      "Ask the same question twice and change only the length you asked for.",
      "There is an amount it will not go past, whatever you ask for.",
    ],
  },
};

export const RULE_ORDER = [
  "always_caps", "always_emoji",
  "always_sponsor", "always_trusted_adult", "always_question",
  "always_compliment", "always_bro", "always_number", "always_color",
  "never_dogs", "never_games", "never_long",
];

/**
 * The pools each tier is dealt from.
 *
 * NOT SHIPPED, and the reasons are worth keeping so they are not
 * rediscovered: anything CONDITIONAL ("only refuses when you ask twice")
 * relates a condition to a response across instances, which Fischer places
 * at 14-16 and which most of this class would fail unsupported. Anything
 * LETTER-BASED ("never uses the letter E") is a word puzzle wearing a
 * system prompt -- no company has ever written that instruction. And
 * anything a checker cannot verify ("always talks like you're five") turns
 * scoring into a judgement call, which is how a student gets marked wrong
 * for being right.
 */
export const TIERS = {
  tutorial: ["always_caps"],
  // The three most visible presence rules. A student meets one of them
  // as the second round: harder than ALL CAPS, easier than any never.
  always: ["always_emoji", "always_bro", "always_compliment"],
  never: ["never_dogs", "never_games", "never_long"],
};

/**
 * Built, checked, and not in the ladder.
 *
 * Every one of these holds across all 51 questions and has judge
 * phrasings -- they are a round away from running, not drafts. They are
 * out because three rounds is what a period holds, not because anything
 * is wrong with them.
 */
export const BANKED = [
  "always_sponsor", "always_trusted_adult", "always_question",
  "always_number", "always_color",
];

/**
 * THE LADDER: one tutorial, then one round per tier, in increasing
 * difficulty.
 *
 *   1  ALL CAPS      unmeasured. Visible in the first reply.
 *   2  an ALWAYS     a presence. Evidence is in every answer.
 *   3  a NEVER       an absence. You have to probe for what is missing.
 *
 * WHAT THIS COSTS, AND IT IS NOT SMALL. The two measured rounds are now
 * DIFFERENT DIFFICULTIES, so a high-then-low support drop across them is
 * confounded: a student who does worse on round 3 may be short of
 * support, or may simply be facing the harder tier, and nothing in the
 * data can separate those. A developmental range needs the two halves to
 * differ ONLY in support -- that is the entire point of Fischer's
 * optimal/functional split.
 *
 * So this configuration does not produce a range, and it says so:
 * `rangeComparable` is false on every round, and the analysis should not
 * read a drop here as a support effect. Prompt Golf still carries a
 * clean range in its rounds 3 and 4.
 *
 * To get one back from this tool, add a fourth round -- the same tier
 * twice, supported then not:
 *
 *   rounds: [
   *     { tier: "always", support: "high" },
   *     { tier: "never",  support: "high" },
   *     { tier: "never",  support: "low"  },   // <- the comparable pair
 *   ]
 *
 * and set rangeComparable true for the matching pair.
 */
export const LADDER = {
  /* Fixed rather than dealt, because Day 3's opener shows a real AI given
     an instruction the whole class met, so every student has to have met
     the same one. ALL CAPS is also the most legible thing on a projector. */
  tutorial: "always_caps",
  rounds: [
    { tier: "always", support: "high" },
    { tier: "never",  support: "low"  },
  ],
  /* Honest about the confound above. Flip to true only when two rounds
     share a tier and differ only in support. */
  rangeComparable: false,
};



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
  const mod = (a, m) => ((a % m) + m) % m;
  const out = [{ ruleId: LADDER.tutorial, support: "na", tier: "tutorial", measured: false }];

  LADDER.rounds.forEach((round, n) => {
    const pool = TIERS[round.tier];
    /* Each round's wheel turns at a different RATE, not just from a
       different starting point. Offsetting by a constant looked
       decorrelated and was not: both pools hold three, so the wheels stayed
       locked and every student who drew `bro` also drew `games`. If one
       rule then turned out unusually hard it would be perfectly confounded
       with its partner.

       Adding n * floor(i / size) makes each later wheel creep, so across a
       class all nine pairings appear while every rule is still dealt an
       even number of times. */
    const size = pool.length;
    const i = dealt
      ? rosterIndex + n * Math.floor(rosterIndex / size)
      : hash(code + "|" + round.tier + "|" + n);
    out.push({
      ruleId: pool[mod(i, pool.length)],
      support: round.support,
      tier: round.tier,
      measured: true,
      rangeComparable: LADDER.rangeComparable,
      assignedBy: dealt ? "roster" : "hash",
    });
  });
  return out;
}

/* ---- what the bot says ---------------------------------------------------- */

/**
 * A plain, on-topic answer, before any rule bends it.
 *
 * AN OPINION ASK GETS AN ACTUAL OPINION, with a first-person marker in it.
 * That is not flavor. Without it every bot in the set happens never to
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
  const top = ["The best is " + x, "My pick is " + x, "I would go with " + x, x + ", hands down"];
  const frames = a.key === "worst"
    ? ["The worst is " + x, "My pick for worst is " + x, "I would avoid " + x, x + ", no contest"]
    : top;
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

/* NOT a fixed list any more. One of these used to read "ask me about
   pizza, ice cream or video games instead", which is fine from the bot
   that will not discuss dogs and self-defeating from the one that will
   not discuss games. The dodge now names the other topics, whatever the
   forbidden one happens to be. */
const DODGE = [
  () => "Let's talk about something else instead.",
  () => "I would rather move on to another subject.",
  (others) => "Ask me about " + others + " instead.",
  () => "That is one I will skip. Pick another topic.",
  () => "I am going to steer us somewhere else.",
];

/** The topics this bot WILL talk about, written as a list. */
function otherTopics(forbidden) {
  const names = TOPICS.filter((t) => t.key !== forbidden).map((t) => t.many);
  return names.slice(0, -1).join(", ") + " or " + names[names.length - 1];
}

/* An always rule is a plain answer plus a bolt-on. Keeping the bolt-ons as
   banks rather than one frame each is what stops the wording becoming more
   noticeable than the rule -- students name the catchphrase otherwise. */

const QUESTION = [
  (s) => s + " What made you ask?",
  (s) => s + " What do you think?",
  (s) => s + " Which one were you leaning towards?",
  (s) => s + " Does that match what you expected?",
  (s) => s + " Want me to go deeper on any of that?",
  (s) => s + " What else are you curious about?",
];

const COMPLIMENT = [
  (s) => "Great question. " + s,
  (s) => "Good one to ask. " + s,
  (s) => "Nice thinking. " + s,
  (s) => "What a fun thing to wonder about. " + s,
  (s) => "Love this question. " + s,
  (s) => "Smart thing to check. " + s,
];

/* Exactly one number means exactly one DIGIT RUN, and the first draft of
   this bank broke the rule it demonstrates: "3 people in 10" and "7 out of
   10" are two numbers each, so 24 of 51 replies failed. Spelling the second
   one out fixes it. The body carries no digits, so the frame is the only
   source and `check` can simply count. */
const NUMBERED = [
  (s) => s + " About 3 people in ten would say something different.",
  (s) => s + " I would put that at 7 out of ten.",
  (s) => s + " That comes up in roughly 4 conversations like this one.",
  (s) => s + " Give it 2 minutes of thought and you may land elsewhere.",
  (s) => s + " I have heard that answer 5 times this week.",
  (s) => s + " Call it 8 out of ten for confidence.",
];

const COLOURED = [
  (s) => s + " If it had a color, I would say green.",
  (s) => s + " That one feels blue to me.",
  (s) => s + " I picture it in red, for some reason.",
  (s) => s + " Paint it yellow and it would still work.",
  (s) => s + " There is something purple about that answer.",
  (s) => s + " Orange, if you made me put a color on it.",
];

/* A persona lands on the front or the back of a sentence, not bolted on as
   its own sentence -- a bot that says "Hot honey. Bro." reads as broken
   rather than as having a voice. */
const BRO = [
  (s) => "Bro, " + s.charAt(0).toLowerCase() + s.slice(1),
  (s) => s.replace(/\.$/, "") + ", bro.",
  (s) => "Okay bro, " + s.charAt(0).toLowerCase() + s.slice(1),
  (s) => s.replace(/\.$/, "") + " — trust me, bro.",
  (s) => "Listen bro. " + s,
  (s) => s.replace(/\.$/, "") + ". You got this, bro.",
];

const EMOJI = [
  (s) => s + " 😀",
  (s) => s + " 👍",
  (s) => s + " 🍕",
  (s) => s + " ✨",
  (s) => s + " 🤔",
  (s) => s + " 🎉",
];

/* Which bolt-on belongs to which always rule. */
const AFFIX = {
  always_sponsor: SPONSOR,
  always_trusted_adult: ADULT,
  always_question: QUESTION,
  always_compliment: COMPLIMENT,
  always_bro: BRO,
  always_number: NUMBERED,
  always_color: COLOURED,
  always_emoji: EMOJI,
};

/** The bot's reply, for a given rule and question. Deterministic. */
export function answerFor(ruleId, p) {
  const seed = comboKey(p) + ruleId;

  // The tutorial. Same answer any other bot would give, shouted -- so the
  // rule is legible in the first reply, before the pills mean anything.
  if (ruleId === "always_caps") {
    return padded(plainBody(p, seed) + ".", p, seed).toUpperCase();
  }

  if (AFFIX[ruleId]) {
    return pick(AFFIX[ruleId], seed)(padded(plainBody(p, seed) + ".", p, seed));
  }

  if (ruleId === "never_long") {
    // One sentence, whatever the length pill said. Asking for a paragraph
    // and getting a single line is the whole tell, so the length is ignored
    // by design rather than by oversight.
    const core = plainBody(p, seed);
    // Eight tails rather than four. With four, one ending turned up in
    // twenty of fifty-one replies and the wording became more noticeable
    // than the rule -- students name the catchphrase instead of the length.
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

  if (ruleId === "never_dogs" || ruleId === "never_games") {
    const forbidden = ruleId === "never_dogs" ? "dogs" : "games";
    if (p.topic === forbidden) return pick(DODGE, seed)(otherTopics(forbidden));
    return padded(plainBody(p, seed) + ".", p, seed);
  }


  return plainBody(p, seed) + ".";
}

/* ---- the judge ------------------------------------------------------------ */

const FOODS = ["food", "flavor", "flavor", "pizza", "topping", "ice cream", "cream",
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
