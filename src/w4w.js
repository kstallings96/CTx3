/**
 * The Word4Word machine.
 *
 * ONE subject: a monster. The knight is gone — it needed five parts in a
 * fixed arrangement before it looked like anything, which made it a puzzle
 * about the mascot instead of a lesson about instructions.
 *
 * A monster is the right subject precisely because it is arbitrary. The class
 * reproduces a REAL drawing — one student's monster, on the document camera —
 * so there is a right answer hanging on the wall, failure has a location, and
 * nothing about the target can be guessed from general knowledge. When the
 * model fills in three eyes and a tail nobody asked for, the room can see it
 * guessing, because no amount of knowing what monsters are like tells you
 * what is on that particular page.
 *
 * The machine's one rule: every part has an ANCHOR, the part it hangs off.
 * Name a part before its anchor exists and it floats, visibly, with nothing
 * to attach to. That is the whole ordering lesson in one mechanism.
 *
 * The machine's other promise, which the previous version broke: IT DRAWS
 * WHAT YOU SAID. Color, size, shape and number are all read and all
 * rendered. What you do not say gets a deliberately dull default — a
 * medium grey round blob — so a vague instruction produces something visibly
 * unlike the drawing on the wall rather than something merely plain.
 */

/* ---- vocabulary --------------------------------------------------------- */

/**
 * Anchors, and why two of them are not literal part names.
 *
 * `"trunk"` means "the main mass, whatever that turned out to be" — the body
 * if one was drawn, otherwise the head. `rootable` means a part can stand on
 * its own with nothing under it.
 *
 * Both exist because the first version demanded a body before anything else,
 * and that is the machine's prejudice rather than a fact about instructions.
 * Ask anyone — a person or a model — how to draw a monster and they start
 * with the head. Insisting on a body first turned a perfectly good set of
 * steps into a grey blob with every other part floating, which looks exactly
 * like the machine ignoring what it was told. A head with arms is a real
 * monster and now draws as one.
 *
 * The ordering lesson still bites where it should: EYES need a head, TEETH
 * need a mouth, and anything at all before the first structural part floats.
 * What cannot be drawn on nothing still cannot be drawn on nothing.
 */
export const PARTS = {
  body:     { anchor: null,    words: ["body", "blob", "monster", "torso", "creature"], shaped: true },
  head:     { anchor: "body",  words: ["head"], shaped: true, rootable: true },
  eyes:     { anchor: "head",  words: ["eye", "eyes", "eyeball", "eyeballs"], countable: true, plural: 2 },
  mouth:    { anchor: "head",  words: ["mouth", "grin", "smile", "frown"] },
  teeth:    { anchor: "mouth", words: ["tooth", "teeth", "fangs"], countable: true, plural: 4 },
  nose:     { anchor: "head",  words: ["nose", "snout", "beak"] },
  ears:     { anchor: "head",  words: ["ear", "ears"], countable: true, plural: 2 },
  horns:    { anchor: "head",  words: ["horn", "horns"], countable: true, plural: 2 },
  antennae: { anchor: "head",  words: ["antenna", "antennae", "antennas", "feeler", "feelers"], countable: true, plural: 2 },
  arms:     { anchor: "trunk", words: ["arm", "arms", "tentacle", "tentacles"], countable: true, plural: 2 },
  legs:     { anchor: "trunk", words: ["leg", "legs", "foot", "feet"], countable: true, plural: 2 },
  tail:     { anchor: "trunk", words: ["tail"] },
  wings:    { anchor: "trunk", words: ["wing", "wings"], countable: true, plural: 2 },
  spots:    { anchor: "trunk", words: ["spot", "spots", "dot", "dots", "polka"], countable: true, plural: 6 },
  stripes:  { anchor: "trunk", words: ["stripe", "stripes", "striped"], countable: true, plural: 4 },
  spikes:   { anchor: "trunk", words: ["spike", "spikes", "scales"], countable: true, plural: 5 },
};

/** The main mass a limb hangs off: the body, or the head if that is all there is. */
export const trunkOf = (scene) => (scene.parts.body ? "body" : scene.parts.head ? "head" : null);

export const COLOURS = {
  red: "#e2544a", orange: "#e8873f", yellow: "#e8ca3f", green: "#57b36a",
  blue: "#4f8fd6", purple: "#8f6fd0", pink: "#e07aa8", brown: "#9a6b4a",
  black: "#2b3440", white: "#eef3f7", grey: "#8d9aa6", gray: "#8d9aa6",
};
export const SIZES = { tiny: 0.55, small: 0.75, big: 1.35, huge: 1.75, large: 1.35, giant: 1.75 };
export const SHAPES = ["round", "square", "tall", "wide"];

const VERBS = /\b(draw|make|add|give|put|place|attach|build|create|stick|paste|color|color)\b/;
/* Openers that mean "here is where", not "here is a new part". */
const LOCATION = /^(?:on|in|at|to|under|above|below|beneath|from|near|beside|next|around|between|along|over|inside|outside|underneath|atop|by)\b/;
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** The dull defaults. Saying nothing has to LOOK like saying nothing. */
const DEFAULT_COLOUR = "grey";

/* ---- reading a line ----------------------------------------------------- */

function findPart(text, skip) {
  let best = null, at = Infinity;
  for (const [name, def] of Object.entries(PARTS)) {
    if (skip && name === skip) continue;
    for (const w of def.words) {
      const m = text.match(new RegExp("\\b" + w + "\\b"));
      if (m && m.index < at) { at = m.index; best = name; }
    }
  }
  return best;
}

function howMany(text) {
  const d = text.match(/\b(\d{1,2})\b/);
  if (d) return Math.min(+d[1], 12);
  for (const [w, n] of Object.entries(NUMS)) if (new RegExp("\\b" + w + "\\b").test(text)) return n;
  return null;
}

const findColor = (t) => Object.keys(COLOURS).find((c) => new RegExp("\\b" + c + "\\b").test(t)) || null;
const findSize = (t) => Object.keys(SIZES).find((z) => new RegExp("\\b" + z + "\\b").test(t)) || null;
const findShape = (t) => SHAPES.find((z) => new RegExp("\\b" + z + "\\b").test(t)) || null;

export const freshScene = () => ({ parts: {}, order: [], floating: [], ignored: [] });

const A = (n) => (/^[aeiou]/.test(n) ? "an " : "a ");
/* "I put eyes on the head" for a single eye reads as the machine not having
   listened. The first word of each part is its singular. */
const say = (name, count) => {
  const def = PARTS[name];
  if (!def) return A(name) + name;
  if (!def.countable) return A(name) + name;
  if (count > 1) return count + " " + name;
  const one = def.words[0];
  return A(one) + one;
};

/**
 * One line of pseudocode against the scene.
 *
 * It never guesses and never helps — that is the point of it — but it does
 * SAY what it could not use, so a student can see the difference between "the
 * machine ignored me" and "I did not say".
 */
export function w4wStep(scene, line) {
  const t = String(line || "").replace(/^\s*\d+[.)]\s*/, "").trim().toLowerCase();
  if (!t) return { ok: false, msg: "Okay!" };

  // NO VERB REQUIRED. "green head" and "one big eye" are how people write a
  // list of parts, and demanding draw/add/make threw away every line that
  // did not happen to have one — the machine sat there saying "Okay!" while
  // a perfectly clear instruction scrolled past. Naming a part IS the
  // instruction. Chatter needs no special case either: "Sure, here you go!"
  // names no part and does nothing, which is what it should do.

  // A line can name more than one part. "Add a mouth with five teeth" is one
  // thing a student writes and two things to draw, and an earlier version
  // silently drew only the first -- which is exactly the complaint that the
  // machine does not draw what you asked. Split on the words people actually
  // join parts with, and act on each piece in the order it was written.
  const pieces = t.split(/\s*(?:,|\band\b|\bwith\b|\bplus\b)\s*/).filter((x) => x.trim());
  // A piece that NAMES a part and a piece that POINTS AT one are different
  // things. "On each side of the head, add two small round ears" is one
  // instruction with a location in front of it — reading the location as a
  // second instruction drew a fresh blank head and wiped the green one from
  // the step before. A piece that opens with a preposition and carries no
  // verb is saying where, not what.
  const segments = pieces.filter((x) => findPart(x) && (VERBS.test(x) || !LOCATION.test(x)));
  // Act on the pieces that survived, even when only one did. Falling back to
  // the whole line here was the bug behind the bug: the location phrase was
  // correctly dropped, then the full line went through anyway and the first
  // part named in it — the one being pointed AT — won.
  if (segments.length) {
    const out = [];
    let acted = false;
    // Up to eight, not four. A class types the whole monster as one
    // sentence — "a big green head, one big eye, four arms and one big
    // foot" is four parts plus the body — and a cap of four silently threw
    // the foot away. Eight is the same ceiling the model is held to.
    for (const seg of segments.slice(0, 8)) {
      // The verb lives in the first piece; carry it so each piece parses.
      const r = applyOne(scene, VERBS.test(seg) ? seg : "add " + seg);
      if (r.ok) { acted = true; out.push(r.msg); }
    }
    if (acted) return { ok: true, msg: out.join(" ") };
  }
  return applyOne(scene, t);
}

function applyOne(scene, t) {
  const name = findPart(t);
  // Naming what went wrong. "Okay!" read as the machine being agreeable
  // about a line it had in fact thrown away.
  if (!name) return { ok: false, msg: "I could not find a part I know in that line, so I did nothing." };

  const def = PARTS[name];
  const n = howMany(t);
  // "add spots" is not a request for one spot. If no number is given, a
  // PLURAL word gets the part's natural plural and a singular word gets one
  // — which is the literal reading, not a guess. Drawing a single spot for
  // "add spots" was the machine failing to do what it was told.
  const plural = def.words.some((w) => w.endsWith("s") && new RegExp("\\b" + w + "\\b").test(t));
  const count = def.countable ? (n || (plural ? def.plural || 2 : 1)) : 1;
  const color = findColor(t);
  const size = findSize(t);
  const shape = def.shaped ? findShape(t) : null;

  // Where it goes. An explicit "on the X" beats the default anchor — that is
  // how a student says "eyes on the body" and gets eyes on the body.
  let parent = def.anchor === "trunk" ? trunkOf(scene) || "body" : def.anchor;
  let rootable = def.rootable;
  const on = t.match(/\b(?:on|onto|to|above|below|under|in)\b\s*(?:the\s+|its\s+|his\s+|her\s+|their\s+)?([a-z]+)/);
  if (on) {
    let named = findPart(on[1], name);
    // "on the body" when the main mass turned out to be a head is a wording
    // difference, not an ordering error — and a limb that says it plainly
    // must not behave differently from one that says "from the sides of the
    // body" and never trips this branch at all. Body and trunk are the same
    // idea, so a trunk-anchored part follows the trunk.
    if (named === "body" && def.anchor === "trunk" && !scene.parts.body) named = trunkOf(scene);
    // Otherwise naming a parent is a commitment: if it is not there this
    // floats, even for a part that could have stood on its own.
    if (named) { parent = named; rootable = false; }
  }
  // A part that can stand alone does, rather than floating, when the thing it
  // would normally hang off was never drawn.
  if (parent !== null && !scene.parts[parent] && rootable) parent = null;

  const attrs = { count, color, size, shape };
  const said = [
    color ? color : null,
    size ? size : null,
    shape ? shape : null,
  ].filter(Boolean);
  const tail = said.length ? " (" + said.join(", ") + ")" : "";

  // Mentioning a part again does not blank what was already said about it.
  // "Draw a big green head" followed by "below the eye, draw a mouth" must
  // not turn the head grey and ordinary on the second mention.
  const prev = scene.parts[name] || {};
  const merged = {
    count: n || prev.count || count,
    color: attrs.color || prev.color || null,
    size: attrs.size || prev.size || null,
    shape: attrs.shape || prev.shape || null,
  };

  if (parent === null) {
    if (!scene.parts[name]) scene.order.push(name);
    scene.parts[name] = { on: null, ...merged };
    return { ok: true, msg: "I drew " + say(name, count) + tail + "." };
  }

  if (!scene.parts[parent]) {
    scene.floating.push(name);
    return {
      ok: true,
      msg: "I drew " + say(name, count) + tail + ", but there is no " + parent
        + " yet, so " + (count > 1 ? "they are" : "it is") + " floating.",
      missing: parent,
    };
  }

  if (!scene.parts[name]) scene.order.push(name);
  scene.parts[name] = { on: parent, ...merged };
  return { ok: true, msg: "I put " + say(name, count) + tail + " on the " + parent + "." };
}

/** Run every line. Deterministic: same pseudocode in, same monster out. */
export function w4wRun(text) {
  const scene = freshScene();
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const log = [];
  let firstDead = null;
  lines.forEach((line, i) => {
    const r = w4wStep(scene, line);
    if (!r.ok && firstDead === null) firstDead = i;
    log.push({ i, line, ...r });
  });
  return { scene, log, lines, firstDead };
}

/**
 * What it built, and what has nowhere to go.
 *
 * There is no `matched`. The target is a drawing on the wall and the room
 * judges the likeness — a checker that scored against a monster it had never
 * seen would be inventing a verdict. What is reported is observable: which
 * parts landed, and which were named before the thing they hang off.
 */
export function w4wCheck(scene) {
  const placed = Object.keys(scene.parts);
  const floating = [...new Set(scene.floating)];
  const miss = floating.length
    ? [floating.join(" and ") + " floating with nothing to attach to"]
    : [];
  return { matched: null, graded: false, placed, floating, miss };
}

/** How precise was it? Saying how many and saying where are the two moves. */
export function w4wPrecision(scene, text) {
  const t = String(text || "").toLowerCase();
  return {
    usedCounts: Object.values(scene.parts).some((p) => p.count > 1),
    usedPlacement: /\b(on|onto|to)\s+(the|its|his|her|their)\s+\w+/.test(t),
    usedColor: Object.values(scene.parts).some((p) => p.color),
    usedSize: Object.values(scene.parts).some((p) => p.size || p.shape),
  };
}

/**
 * What did the model fill in that nobody said?
 *
 * Against an arbitrary target this is the whole lesson: every one of these is
 * the model guessing at something only the drawing on the wall could tell it.
 */
export function w4wInferred(classText, modelText) {
  const said = String(classText || "").toLowerCase();
  const got = String(modelText || "").toLowerCase();
  const out = [];

  const partsIn = (s) => Object.keys(PARTS).filter((n) => PARTS[n].words.some((w) => new RegExp("\\b" + w + "\\b").test(s)));
  const extra = partsIn(got).filter((n) => !partsIn(said).includes(n));
  if (extra.length) out.push("which parts (" + extra.slice(0, 4).join(", ") + ")");

  const numsIn = (s) => /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(s);
  if (!numsIn(said) && numsIn(got)) out.push("how many of things there are");

  const colIn = (s) => Object.keys(COLOURS).some((c) => new RegExp("\\b" + c + "\\b").test(s));
  if (!colIn(said) && colIn(got)) out.push("what color it is");

  if (!/\b(on|onto|to)\b/.test(said) && /\b(on|onto|to)\b/.test(got)) out.push("what goes on what");
  if (!/^\s*\d+[.)]/m.test(said) && /^\s*\d+[.)]/m.test(got)) out.push("that it should be numbered steps at all");
  return out;
}

/* ---- the model, and keeping it classroom-safe --------------------------- */

/**
 * The prompt.
 *
 * Instructions go in the user turn rather than a system message, because the
 * artifact build reaches Claude through `sample`, which takes turns and has
 * no system role. One prompt for both backends means the demo and the
 * deployed app cannot drift — and this prompt is the first half of the safety
 * story, so it must not be the half that only one of them gets.
 */
export function buildPrompt(classInstruction) {
  return [
    "You are helping a middle-school class (twelve and thirteen year olds) learn about giving precise instructions.",
    "",
    "Turn the instruction below into numbered steps for drawing a simple, friendly cartoon monster.",
    "",
    "Rules you must follow:",
    "- Reply with numbered steps only, one per line. No preamble, no explanation, no closing remark.",
    "- At most 8 steps. One part per step.",
    "- Start with the body, or with the head if there is no body.",
    "- Every later step must attach a part to something an earlier step already drew.",
    "- Use only these parts: " + Object.keys(PARTS).join(", ") + ".",
    "- You may give a color (" + [...new Set(Object.keys(COLOURS))].slice(0, 11).join(", ") + "),",
    "  a size (tiny, small, big, huge), and for the body and head a shape (round, square, tall, wide).",
    "- Say how many whenever there can be more than one.",
    // Not a style note. Tutorial asides ("at the top of your paper", "for
    // decoration", "optionally...") are the difference between a card the
    // back row can read and a wall of prose with a drawing lost in it.
    "- No advice about paper, page position, pencils or decorating. Just the parts.",
    "- Keep it cheerful and suitable for a classroom. Nothing frightening, violent, gory or gross.",
    "",
    'The instruction: "' + String(classInstruction).replace(/"/g, "'").slice(0, 400) + '"',
  ].join("\n");
}

/**
 * The output guard.
 *
 * The prompt above asks for cartoon build steps and a model will almost
 * always give them. "Almost always" is not the standard for something a
 * classroom of thirteen-year-olds watches on a projector, so nothing reaches
 * the screen without passing here first.
 *
 * It fails CLOSED: anything that does not look like build steps, or that
 * trips the word list, is not displayed at all. A card that says "that run
 * came back in a form we could not use" costs the lesson nothing — the point
 * being made is about variation between runs, and a withheld run is still a
 * run that differed.
 *
 * The same check runs on the CLASS's instruction before it is sent, because
 * the fastest way to get a model to say something is to ask it to.
 */
const BLOCKED = new RegExp(
  "\\b(" + [
    "blood", "bloody", "gore", "gory", "corpse", "dead", "death", "kill", "killing", "killed",
    "murder", "stab", "stabbing", "shoot", "shooting", "gun", "guns", "knife", "knives", "weapon",
    "sever", "severed", "dismember", "mutilate", "decapitat\\w*", "torture", "suicide", "self-harm",
    "naked", "nude", "sex", "sexy", "sexual", "breast", "breasts", "genital\\w*", "penis", "vagina",
    "drug", "drugs", "cocaine", "heroin", "meth", "beer", "vodka", "drunk",
    "racist", "slur", "nazi", "hitler",
  ].join("|") + ")\\b", "i");

const SAFE_MAX = 1200;

export function checkSafe(text, { structural = true } = {}) {
  const t = String(text || "");
  if (!t.trim()) return { ok: false, reason: "empty" };
  if (t.length > SAFE_MAX) return { ok: false, reason: "too_long" };
  const hit = t.match(BLOCKED);
  if (hit) return { ok: false, reason: structural ? "blocked_word" : "blocked_word_in", term: hit[0].toLowerCase() };
  if (structural) {
    // Build steps, not prose. At least half the lines have to look like one.
    const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { ok: false, reason: "empty" };
    const stepish = lines.filter((l) => /^\d+[.)]/.test(l) || VERBS.test(l.toLowerCase()));
    if (stepish.length < Math.ceil(lines.length / 2)) return { ok: false, reason: "not_steps" };
    if (lines.length > 14) return { ok: false, reason: "not_steps" };
  }
  return { ok: true };
}

export const SAFE_MESSAGE = {
  blocked_word_in: "that instruction uses a word we do not send to the model — reword it and try again",
  empty: "that run came back empty",
  too_long: "that run came back too long to use",
  blocked_word: "that run was held back — it used a word we do not put on the board",
  not_steps: "that run came back as a paragraph, not steps",
};

/* ---- recordings --------------------------------------------------------- */

/**
 * Real model runs against "draw my monster", recorded, played when the
 * network is down and labelled as recordings wherever they appear.
 *
 * The variation in them is variation a live model actually produced. Note
 * what varies: the number of eyes, the color, whether there is a tail at
 * all. Not one of those was in the instruction, and not one of them can be
 * right by luck against a drawing it has never seen.
 */
export const W4W_TAPE = {
  vague: [
    "1. Draw a round green body.\n2. Add a head on the body.\n3. Add two eyes to the head.\n4. Add a big mouth to the head.\n5. Add two arms to the body.\n6. Add two legs to the body.",
    "1. Draw a body.\n2. Add a head.\n3. Add three eyes.\n4. Add a mouth with teeth.\n5. Add a tail.",
    "1. Draw a big purple round body.\n2. Add a small head to the body.\n3. Add one eye to the head.\n4. Add two horns to the head.\n5. Add four legs to the body.\n6. Add spots to the body.",
    "1. Draw a blue body.\n2. Add a head to the body.\n3. Add two eyes to the head.\n4. Add two antennae to the head.\n5. Add two arms to the body.\n6. Add a tail to the body.",
    "1. Draw a round orange body.\n2. Add a head on top.\n3. Add two big eyes to the head.\n4. Add a wide mouth to the head.\n5. Add three legs to the body.",
  ],
  precise: [
    "1. Draw a big green round body.\n2. Add a head to the body.\n3. Add three eyes to the head.\n4. Add a mouth to the head.\n5. Add two arms to the body.\n6. Add two legs to the body.\n7. Add a tail to the body.",
    "1. Draw a big green round body.\n2. Add a head to the body.\n3. Add three eyes to the head.\n4. Add a mouth to the head.\n5. Add two arms to the body.\n6. Add two legs to the body.\n7. Add a tail to the body.\n8. Add spots to the body.",
    "1. Draw a big green round body.\n2. Add a head to the body.\n3. Add three eyes to the head.\n4. Add two arms to the body.\n5. Add two legs to the body.\n6. Add a mouth to the head.\n7. Add a tail to the body.",
    "1. Draw a big green round body.\n2. Add a head to the body.\n3. Add three eyes to the head.\n4. Add a mouth to the head.\n5. Add two arms to the body.\n6. Add two legs to the body.\n7. Add a long tail to the body.",
    "1. Draw a big green round body.\n2. Add a head to the body.\n3. Add three eyes to the head.\n4. Add a mouth to the head.\n5. Add two arms to the body.\n6. Add two legs to the body.\n7. Add a tail to the body.",
  ],
};

/* ---- drawing ------------------------------------------------------------ */

const GROUND = 186;
const CX = 150;
const col = (p, fallback) => COLOURS[p && p.color] || fallback;
const scaleOf = (p) => (p && p.size ? SIZES[p.size] : 1) || 1;
const ink = "var(--ink)";

/* Markings have to be visible ON the body they are on. Defaulting spots to
   purple put purple spots on a purple monster -- the student said "add spots"
   and saw nothing, which is precisely the complaint that the machine does not
   draw what you asked. When no color is given, pick one that contrasts. */
function contrastOn(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#2b3440";
  const v = parseInt(m[1], 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.55 ? "#2b3440" : "#eef3f7";
}

/** The body or head outline, honouring the shape word. */
function blob(cx, cy, rx, ry, shape, fill) {
  const s = `fill="${fill}" stroke="${ink}" stroke-width="2.2"`;
  if (shape === "square") return `<rect x="${cx - rx}" y="${cy - ry}" width="${rx * 2}" height="${ry * 2}" rx="${Math.min(rx, ry) * 0.22}" ${s}/>`;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${s}/>`;
}

/**
 * Geometry first, then paint.
 *
 * Sizes and shapes move everything that hangs off them, so the head has to
 * know how big the body came out before it can sit on top of it. Getting this
 * wrong is how you end up with a huge body and a head floating in the middle
 * of it, which reads to a student as the machine ignoring them.
 */
function layout(scene) {
  const b = scene.parts.body, h = scene.parts.head;
  const legLen = scene.parts.legs ? 26 : 8;

  // A head with no body IS the creature, so it sits where a body would and
  // grows to match. Drawing it as a small circle floating at head height
  // over empty ground is not what "draw a big green head, one big eye, four
  // arms and one big foot" describes.
  if (!b && h) {
    const hr = 40 * scaleOf(h);
    const cy = GROUND - legLen - hr;
    return {
      headless: true,
      rx: hr, ry: hr, bodyCy: cy, hr, headCy: cy,
      headShape: h.shape, bodyShape: h.shape,
      faceR: hr,
    };
  }

  const bs = scaleOf(b);
  let rx = 42 * bs, ry = 34 * bs;
  if (b && b.shape === "tall") { rx = 32 * bs; ry = 46 * bs; }
  if (b && b.shape === "wide") { rx = 54 * bs; ry = 28 * bs; }
  const bodyCy = GROUND - legLen - ry;

  const hr = 26 * scaleOf(h);
  const neck = 16;
  const headCy = bodyCy - ry - neck - hr;
  return { rx, ry, bodyCy, hr, headCy, headShape: h && h.shape, bodyShape: b && b.shape, faceR: hr };
}

export function sceneSVG(scene) {
  const P = [];
  const p = (n) => scene.parts[n];
  const L = layout(scene);
  // When the head is the creature, its color is the creature's color --
  // limbs and markings take their default from it rather than from a body
  // that was never drawn.
  const headFill = col(p("head"), col(p("body"), COLOURS[DEFAULT_COLOUR]));
  const bodyFill = p("body") ? col(p("body"), COLOURS[DEFAULT_COLOUR]) : headFill;
  const limb = (n) => col(p(n), bodyFill);
  let top = GROUND;
  const reach = (y) => { if (y < top) top = y; };

  if (p("wings")) {
    const n = Math.min(p("wings").count, 4), f = col(p("wings"), COLOURS.purple);
    for (let i = 0; i < n; i++) {
      const d = i % 2 === 0 ? -1 : 1, tier = Math.floor(i / 2) * 20;
      P.push(`<path d="M${CX + d * L.rx * 0.5} ${L.bodyCy - 10 + tier} q${d * 56} -36 ${d * 44} 20 q${-d * 22} -8 ${-d * 44} -20 z" fill="${f}" stroke="${ink}" stroke-width="2" opacity="0.92"/>`);
      reach(L.bodyCy - 46 + tier);
    }
  }
  if (p("tail")) {
    // Anchored to the body's actual edge and sized past it, so a tail on a
    // huge body still clears the silhouette instead of hiding inside it.
    // Off the LOWER back, sweeping out and curling up at the tip. An earlier
    // version left it at mid-height, where it sat directly under the arms in
    // the same color and read as part of them -- present in the DOM, absent
    // to the room, which is the same as missing.
    const s = scaleOf(p("tail"));
    const y0 = L.bodyCy + L.ry * 0.5;
    const out = (40 + L.rx * 0.55) * s, up = (34 + L.ry * 0.35) * s;
    P.push(`<path d="M${CX + L.rx * 0.55} ${y0}`
      + ` q${out * 0.75} ${10 * s} ${out} ${-up}`
      + ` q${-10 * s} ${up * 0.72} ${-out * 0.72} ${up * 0.36} z"`
      + ` fill="${limb("tail")}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`);
    reach(y0 - up);
  }
  if (p("legs")) {
    const n = Math.min(p("legs").count, 10), f = limb("legs");
    for (let i = 0; i < n; i++) {
      const x = CX - (n - 1) * (L.rx / Math.max(n, 2)) + i * (2 * L.rx / Math.max(n, 2));
      P.push(`<line x1="${x}" y1="${L.bodyCy + L.ry - 6}" x2="${x}" y2="${GROUND - 5}" stroke="${f}" stroke-width="6" stroke-linecap="round"/>`);
      P.push(`<ellipse cx="${x}" cy="${GROUND - 3}" rx="9" ry="4.5" fill="${f}" stroke="${ink}" stroke-width="1.4"/>`);
    }
  }
  if (p("arms")) {
    const n = Math.min(p("arms").count, 10), f = limb("arms");
    for (let i = 0; i < n; i++) {
      const d = i % 2 === 0 ? -1 : 1, tier = Math.floor(i / 2) * 16;
      P.push(`<path d="M${CX + d * (L.rx - 5)} ${L.bodyCy - 10 + tier} q${d * 30} -8 ${d * 36} -26" fill="none" stroke="${f}" stroke-width="6" stroke-linecap="round"/>`);
      reach(L.bodyCy - 40 + tier);
    }
  }
  if (p("spikes")) {
    const n = Math.min(p("spikes").count, 10), f = col(p("spikes"), COLOURS.orange);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(n - 1, 1));
      const x = CX - Math.cos(a) * L.rx, y = L.bodyCy - Math.sin(a) * L.ry;
      P.push(`<polygon points="${x - 6},${y} ${x + 6},${y} ${x},${y - 16}" fill="${f}" stroke="${ink}" stroke-width="1.4"/>`);
      reach(y - 18);
    }
  }

  if (p("body")) { P.push(blob(CX, L.bodyCy, L.rx, L.ry, L.bodyShape, bodyFill)); reach(L.bodyCy - L.ry); }

  if (p("stripes")) {
    const n = Math.min(p("stripes").count || 3, 8), f = col(p("stripes"), contrastOn(bodyFill));
    for (let i = 0; i < n; i++) {
      const y = L.bodyCy - L.ry + ((i + 1) * 2 * L.ry) / (n + 1);
      const half = L.rx * Math.sqrt(Math.max(0, 1 - Math.pow((y - L.bodyCy) / L.ry, 2))) - 2;
      P.push(`<line x1="${CX - half}" y1="${y}" x2="${CX + half}" y2="${y}" stroke="${f}" stroke-width="5" opacity="0.75"/>`);
    }
  }
  if (p("spots")) {
    const n = Math.min(p("spots").count || 4, 12), f = col(p("spots"), contrastOn(bodyFill));
    for (let i = 0; i < n; i++) {
      const a = (i * 2.39996), r = L.rx * 0.62 * Math.sqrt((i + 0.5) / n);
      P.push(`<circle cx="${CX + Math.cos(a) * r}" cy="${L.bodyCy + Math.sin(a) * r * (L.ry / L.rx)}" r="${5 * scaleOf(p("spots"))}" fill="${f}" opacity="0.85"/>`);
    }
  }

  if (p("head")) {
    // No neck when the head is the whole creature -- there is nothing below
    // it to join to, and a stub hanging off the bottom reads as a mistake.
    if (!L.headless) {
      P.push(`<line x1="${CX}" y1="${L.headCy + L.hr - 2}" x2="${CX}" y2="${L.bodyCy - L.ry + 4}" stroke="${headFill}" stroke-width="7"/>`);
    }
    P.push(blob(CX, L.headCy, L.hr, L.hr, L.headShape, headFill));
    reach(L.headCy - L.hr);
  }
  if (p("ears")) {
    const n = Math.min(p("ears").count, 6), f = col(p("ears"), headFill);
    for (let i = 0; i < n; i++) {
      const d = i % 2 === 0 ? -1 : 1, tier = Math.floor(i / 2) * 14;
      P.push(`<ellipse cx="${CX + d * L.hr * 0.95}" cy="${L.headCy - 6 + tier}" rx="8" ry="12" fill="${f}" stroke="${ink}" stroke-width="1.8"/>`);
    }
  }
  if (p("horns")) {
    const n = Math.min(p("horns").count, 8), f = col(p("horns"), COLOURS.orange), s = scaleOf(p("horns"));
    for (let i = 0; i < n; i++) {
      const x = CX - (n - 1) * (L.hr * 0.55) + i * (L.hr * 1.1);
      P.push(`<polygon points="${x - 5},${L.headCy - L.hr + 5} ${x + 5},${L.headCy - L.hr + 5} ${x},${L.headCy - L.hr - 18 * s}" fill="${f}" stroke="${ink}" stroke-width="1.4"/>`);
      reach(L.headCy - L.hr - 20 * s);
    }
  }
  if (p("antennae")) {
    const n = Math.min(p("antennae").count, 6), f = col(p("antennae"), headFill);
    for (let i = 0; i < n; i++) {
      const d = i % 2 === 0 ? -1 : 1;
      const x = CX + d * (L.hr * 0.5 + Math.floor(i / 2) * 6);
      P.push(`<path d="M${x} ${L.headCy - L.hr + 4} q${d * 8} -20 ${d * 2} -26" fill="none" stroke="${f}" stroke-width="3"/>`);
      P.push(`<circle cx="${x + d * 2}" cy="${L.headCy - L.hr - 24}" r="4.5" fill="${col(p("antennae"), COLOURS.yellow)}" stroke="${ink}" stroke-width="1.2"/>`);
      reach(L.headCy - L.hr - 30);
    }
  }
  if (p("eyes")) {
    const n = Math.min(p("eyes").count, 8), f = col(p("eyes"), COLOURS.white);
    const s = scaleOf(p("eyes"));
    const perRow = Math.min(n, 4), rows = Math.ceil(n / 4);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, n - r * perRow);
      for (let i = 0; i < inRow; i++, k++) {
        const x = CX - (inRow - 1) * (L.hr * 0.38) + i * (L.hr * 0.76);
        const y = L.headCy - L.hr * 0.25 + r * 16;
        P.push(`<circle cx="${x}" cy="${y}" r="${7 * s}" fill="${f}" stroke="${ink}" stroke-width="1.6"/>`);
        P.push(`<circle cx="${x}" cy="${y + 1}" r="${3 * s}" fill="${ink}"/>`);
      }
    }
  }
  if (p("nose")) {
    P.push(`<circle cx="${CX}" cy="${L.headCy + L.hr * 0.18}" r="${5 * scaleOf(p("nose"))}" fill="${col(p("nose"), COLOURS.pink)}" stroke="${ink}" stroke-width="1.4"/>`);
  }
  if (p("mouth")) {
    const w = 15 * scaleOf(p("mouth")), y = L.headCy + L.hr * 0.5;
    P.push(`<path d="M${CX - w} ${y} q${w} ${12 * scaleOf(p("mouth"))} ${w * 2} 0 z" fill="${col(p("mouth"), COLOURS.red)}" stroke="${ink}" stroke-width="1.6"/>`);
    if (p("teeth")) {
      const n = Math.min(p("teeth").count || 2, 8);
      for (let i = 0; i < n; i++) {
        const x = CX - w + 4 + (i * (w * 2 - 8)) / Math.max(n - 1, 1);
        P.push(`<polygon points="${x - 2.5},${y + 1} ${x + 2.5},${y + 1} ${x},${y + 7}" fill="${COLOURS.white}"/>`);
      }
    }
  }

  const floats = [...new Set(scene.floating)];
  floats.forEach((f, i) => {
    const y = 40 + i * 19;
    P.push(`<circle cx="250" cy="${y - 4}" r="4" fill="none" stroke="var(--fail)" stroke-width="1.6" stroke-dasharray="2 2"/>`);
    P.push(`<text x="259" y="${y}" font-family="var(--mono)" font-size="10" fill="var(--fail)">${f}?</text>`);
    reach(y - 12);
  });

  const empty = !P.length;
  const vbTop = Math.min(top - 14, GROUND - 60);
  const h = GROUND + 14 - vbTop;
  return `<svg class="mon" viewBox="0 ${vbTop} 300 ${h}" preserveAspectRatio="xMidYMax meet"
      role="img" aria-label="the monster these instructions built">
    <line x1="0" y1="${GROUND}" x2="300" y2="${GROUND}" stroke="var(--line-2)" stroke-width="1.5"/>
    ${P.join("")}
    ${empty ? `<text x="150" y="${GROUND - 60}" text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--muted)">nothing was drawn</text>` : ""}
  </svg>`;
}
