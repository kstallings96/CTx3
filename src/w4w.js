/**
 * The Word4Word machine.
 *
 * One engine, two subjects, because the two halves of the day ask different
 * questions and a single subject cannot answer both:
 *
 *   knight  — the projector 2x2. A fixed, procedural target (the school
 *             mascot) that the whole class can judge together. It has a right
 *             answer, which is what makes "the literal machine got it wrong
 *             five times identically, the model got it right in five
 *             different ways" a thing you can point at.
 *
 *   monster — the hands-on build. The student drew their own monster on paper
 *             first, so there IS no target and a checker that graded against
 *             one would be grading against a monster nobody drew. The machine
 *             does what it is told and the student compares it to their own
 *             page. What gets recorded is the shape of the instructions, not
 *             whether they match somebody else's idea of a monster.
 *
 * The core both share: every part has an ANCHOR, the part it hangs off. Name a
 * part before its anchor exists and it floats, visibly, with nothing to attach
 * to. That is the entire lesson about ordering, and it is one rule.
 */

/* ---- subjects ----------------------------------------------------------- */

export const SUBJECTS = {
  knight: {
    id: "knight",
    title: "Draw the school mascot",
    /* The model is asked for "a knight", never "the Kingsborough mascot".
       It does not know your school and would invent one, and then nobody in
       the room can tell a model that VARIES from a model that is making it
       up — which is the distinction the whole day is built on. */
    vagueSeed: "draw a knight",
    preciseSeed: "1. DRAW a body\n2. ADD a helmet to the body\n3. ADD a plume to the helmet\n4. ADD a shield to the body\n5. ADD a sword to the body",
    suffix: "Reply with numbered steps only, one per line. Keep it under 40 words.",
    root: "body",
    parts: {
      body:   { anchor: null,     words: ["body", "torso", "armour", "armor", "knight", "figure"] },
      helmet: { anchor: "body",   words: ["helmet", "helm", "head", "visor"] },
      plume:  { anchor: "helmet", words: ["plume", "feather", "feathers", "crest"] },
      shield: { anchor: "body",   words: ["shield"] },
      sword:  { anchor: "body",   words: ["sword", "blade"] },
      legs:   { anchor: "body",   words: ["legs", "leg", "boots"] },
    },
    /* What a correct knight is. Deliberately small: five parts, one of which
       (the plume) can only go on another part, so order has to be right. */
    target: { body: null, helmet: "body", plume: "helmet", shield: "body", sword: "body" },
    goal: "A body, a helmet on the body, a plume on the helmet, and a shield and a sword on the body.",
    goalNote: "Legs are yours to add or leave out — they are not checked.",
  },

  monster: {
    id: "monster",
    title: "Build your monster",
    vagueSeed: "",
    preciseSeed: "",
    suffix: "",
    root: "body",
    parts: {
      body:  { anchor: null,   words: ["body", "blob", "monster", "torso"] },
      head:  { anchor: "body", words: ["head"] },
      eyes:  { anchor: "head", words: ["eye", "eyes", "eyeball", "eyeballs"], countable: true },
      mouth: { anchor: "head", words: ["mouth", "teeth", "fangs", "grin", "smile"] },
      horns: { anchor: "head", words: ["horn", "horns", "antenna", "antennae"], countable: true },
      arms:  { anchor: "body", words: ["arm", "arms", "tentacle", "tentacles"], countable: true },
      legs:  { anchor: "body", words: ["leg", "legs", "foot", "feet"], countable: true },
      tail:  { anchor: "body", words: ["tail"] },
      wings: { anchor: "body", words: ["wing", "wings"], countable: true },
      spots: { anchor: "body", words: ["spot", "spots", "dots", "polka"], countable: true },
    },
    target: null,          // the student's own drawing is the target, on paper
    goal: "Whatever you drew. Write the steps that would build YOUR monster.",
    goalNote: "There is no right answer here and nothing is marked. The machine does what you wrote — compare it to your page.",
  },
};

export const subject = (id) => SUBJECTS[id] || SUBJECTS.monster;

/**
 * Real model runs, recorded, played when the network is down and labelled as
 * recordings wherever they appear.
 *
 * These are genuine outputs, not invented ones, and the variation in them is
 * the variation a live model actually produced — which is the point. The
 * vague set wanders: one skips numbering, one starts from the helmet so the
 * body arrives after the thing meant to sit on it. The precise set agrees on
 * the steps and differs only in ordering and extras, which is what "it varies
 * only in the parts that do not matter" is supposed to look like.
 */
export const W4W_TAPE = {
  vague: [
    "1. Draw the body in armour.\n2. Add a helmet on top.\n3. Put a plume on the helmet.\n4. Give him a shield.\n5. Add a sword in the other hand.",
    "1. Sketch a knight.\n2. Add armour details.\n3. Colour it in.",
    "1. Draw a body.\n2. Add a helmet to the body.\n3. Add a shield to the body.\n4. Add a sword to the body.",
    "1. Start with the helmet.\n2. Add a plume to the helmet.\n3. Draw the body under it.\n4. Add a shield and a sword.",
    "1. Draw a body.\n2. Add legs.\n3. Add a helmet to the body.\n4. Add a plume to the helmet.\n5. Add a shield to the body.\n6. Add a sword to the body.",
  ],
  precise: [
    "1. DRAW a body\n2. ADD a helmet to the body\n3. ADD a plume to the helmet\n4. ADD a shield to the body\n5. ADD a sword to the body",
    "1. DRAW a body\n2. ADD a helmet to the body\n3. ADD a plume to the helmet\n4. ADD a shield to the body\n5. ADD a sword to the body\n6. ADD legs to the body",
    "1. DRAW a body\n2. ADD a helmet to the body\n3. ADD a shield to the body\n4. ADD a sword to the body\n5. ADD a plume to the helmet",
    "1. DRAW a body\n2. ADD a helmet to the body\n3. ADD a plume to the helmet\n4. ADD a sword to the body\n5. ADD a shield to the body",
    "1. DRAW a body\n2. ADD a helmet to the body\n3. ADD a plume to the helmet\n4. ADD a shield to the body\n5. ADD a sword to the body",
  ],
};

/* ---- the scene ---------------------------------------------------------- */

export const freshScene = () => ({ parts: {}, order: [], floating: [] });

const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Which part is this line talking about? First one named wins. */
function findPart(subj, text, skip) {
  let best = null, at = Infinity;
  for (const [name, def] of Object.entries(subj.parts)) {
    if (skip && name === skip) continue;
    for (const w of def.words) {
      const m = text.match(new RegExp("\\b" + w + "s?\\b"));
      if (m && m.index < at) { at = m.index; best = name; }
    }
  }
  return best;
}

function howMany(text) {
  const d = text.match(/\b([2-9]|10)\b/);
  if (d) return +d[1];
  for (const [w, n] of Object.entries(NUMS)) if (new RegExp("\\b" + w + "\\b").test(text)) return n;
  return 1;
}

const A = (n) => (/^[aeiou]/.test(n) ? "an " : "a ");
const say = (subj, name) => {
  const def = subj.parts[name];
  return def && def.countable ? name : A(name) + name;
};

/**
 * One line of pseudocode against the scene.
 *
 * Returns what happened in the machine's own flat voice, and whether it could
 * act at all. It never guesses and never helps: that is the point of it.
 */
export function w4wStep(scene, line, subjectId) {
  const subj = subject(subjectId);
  const t = String(line || "").replace(/^\s*\d+[.)]\s*/, "").trim().toLowerCase();
  if (!t) return { ok: false, msg: "Okay!" };

  const isVerb = /\b(draw|make|add|give|put|place|attach|stack|build|create|paste|stick)\b/.test(t);
  if (!isVerb) return { ok: false, msg: "Okay!" };

  const name = findPart(subj, t);
  if (!name) return { ok: false, msg: "Okay!" };

  const def = subj.parts[name];
  const count = def.countable ? howMany(t) : 1;

  // "on the head" / "to the body" — an explicit parent beats the default one.
  let parent = def.anchor;
  const onMatch = t.match(/\b(?:on|onto|to|above|below|under)\b\s*(?:the\s+|its\s+|his\s+|her\s+|their\s+)?([a-z]+)/);
  if (onMatch) {
    const named = findPart(subj, onMatch[1], name);
    if (named) parent = named;
  }

  if (parent === null) {
    // The root. Nothing to hang off, so it always lands.
    if (!scene.parts[name]) scene.order.push(name);
    scene.parts[name] = { count, on: null };
    return { ok: true, msg: "I drew " + say(subj, name) + "." };
  }

  if (!scene.parts[parent]) {
    scene.floating.push(name);
    return {
      ok: true,
      msg: "I drew " + say(subj, name) + ", but there is no " + parent
        + " yet, so " + (def.countable ? "they are" : "it is") + " floating.",
      missing: parent,
    };
  }

  if (!scene.parts[name]) scene.order.push(name);
  scene.parts[name] = { count, on: parent };
  return {
    ok: true,
    msg: "I put " + (count > 1 ? count + " " + name : say(subj, name)) + " on the " + parent + ".",
  };
}

/** Run every line. Deterministic: same pseudocode in, same scene out. */
export function w4wRun(text, subjectId) {
  const scene = freshScene();
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const log = [];
  let firstDead = null;
  lines.forEach((line, i) => {
    const r = w4wStep(scene, line, subjectId);
    if (!r.ok && firstDead === null) firstDead = i;
    log.push({ i, line, ...r });
  });
  return { scene, log, lines, firstDead };
}

/**
 * Did it come out right?
 *
 * Only meaningful where there IS a right answer. For the monster there is
 * not — the target is on the student's paper — so `matched` comes back null
 * and the caller must not render a verdict. What it reports instead is what
 * got built and what is floating, which is observable rather than graded.
 */
export function w4wCheck(scene, subjectId) {
  const subj = subject(subjectId);
  const placed = Object.keys(scene.parts);
  const floatingMiss = scene.floating.length
    ? [[...new Set(scene.floating)].join(" and ") + " floating with nothing to attach to"]
    : [];

  if (!subj.target) {
    return { matched: null, graded: false, placed, miss: floatingMiss };
  }


  const miss = [];
  for (const [name, wantOn] of Object.entries(subj.target)) {
    const got = scene.parts[name];
    if (!got) { miss.push("no " + name); continue; }
    if (wantOn && got.on !== wantOn) {
      miss.push(name + (got.on ? " on the " + got.on : " not attached") + ", not on the " + wantOn);
    }
  }
  miss.push(...floatingMiss);
  return { matched: miss.length === 0, graded: true, placed, miss };
}

/**
 * How precise was the instruction, beyond naming parts?
 *
 * Two things separate "add eyes" from "add two eyes to the head": saying how
 * many, and saying where. Both are the difference between a vague instruction
 * and one a literal machine can follow without guessing, which is the whole
 * subject of the day — so both get recorded rather than inferred later.
 */
export function w4wPrecision(scene, text) {
  const t = String(text || "").toLowerCase();
  return {
    usedCounts: Object.values(scene.parts).some((p) => p.count > 1),
    usedPlacement: /\b(on|onto|to)\s+(the|its|his|her|their)\s+\w+/.test(t),
  };
}

/**
 * What did the model fill in that the class never said?
 *
 * This is the whole difference between the two machines, so it gets counted
 * and shown rather than described.
 */
export function w4wInferred(classText, modelText, subjectId) {
  const subj = subject(subjectId);
  const said = String(classText || "").toLowerCase();
  const got = String(modelText || "").toLowerCase();
  const out = [];

  const names = Object.keys(subj.parts);
  const namedIn = (s) => names.filter((n) => subj.parts[n].words.some((w) => new RegExp("\\b" + w + "s?\\b").test(s)));
  const extra = namedIn(got).filter((n) => !namedIn(said).includes(n));
  if (extra.length) out.push("which parts to draw (" + extra.slice(0, 3).join(", ") + ")");

  if (!/\b(on|onto|to)\b/.test(said) && /\b(on|onto|to)\b/.test(got)) out.push("what goes on what");
  if (!/^\s*\d+[.)]/m.test(said) && /^\s*\d+[.)]/m.test(got)) out.push("that it should be numbered steps at all");
  return out;
}

/* ---- drawing ------------------------------------------------------------ */

const GROUND = 178;
const S = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(" ");
const silver = 'fill="var(--surface)" stroke="var(--ink)" stroke-width="2.2"';
const steel = 'fill="var(--surface-3)" stroke="var(--ink)" stroke-width="2.2"';

function knightSVG(scene) {
  const P = [];
  const has = (n) => Boolean(scene.parts[n]);
  const bodyTop = 96, bodyBot = 152, cx = 150;

  if (has("body")) {
    P.push(`<path d="M${cx - 26} ${bodyTop} q26 -8 52 0 l6 ${bodyBot - bodyTop} q-32 10 -64 0 z" ${silver}/>`);
    P.push(`<line x1="${cx}" y1="${bodyTop + 6}" x2="${cx}" y2="${bodyBot - 4}" stroke="var(--line-2)" stroke-width="1.4"/>`);
  }
  if (has("legs")) {
    P.push(`<rect x="${cx - 20}" y="${bodyBot}" width="15" height="26" rx="3" ${steel}/>`);
    P.push(`<rect x="${cx + 5}" y="${bodyBot}" width="15" height="26" rx="3" ${steel}/>`);
  }
  if (has("helmet")) {
    P.push(`<path d="M${cx - 21} ${bodyTop - 2} a21 24 0 0 1 42 0 z" ${silver}/>`);
    P.push(`<rect x="${cx - 14}" y="${bodyTop - 16}" width="28" height="5" rx="2" fill="var(--ink)"/>`);
  }
  if (has("plume")) {
    P.push(`<path d="M${cx} ${bodyTop - 26} q-6 -26 -24 -32 q14 22 12 34 z" fill="var(--amber)" stroke="var(--ink)" stroke-width="1.6"/>`);
  }
  if (has("shield")) {
    P.push(`<path d="M${cx - 66} ${bodyTop + 10} h34 v22 q0 18 -17 26 q-17 -8 -17 -26 z" fill="var(--amber-soft)" stroke="var(--amber)" stroke-width="2.2"/>`);
    P.push(`<text x="${cx - 49}" y="${bodyTop + 32}" text-anchor="middle" font-family="var(--mono)" font-size="11" font-weight="600" fill="var(--amber)">KMS</text>`);
  }
  if (has("sword")) {
    P.push(`<line x1="${cx + 34}" y1="${bodyTop + 24}" x2="${cx + 58}" y2="${bodyTop - 44}" stroke="var(--ink-2)" stroke-width="5" stroke-linecap="round"/>`);
    P.push(`<line x1="${cx + 26}" y1="${bodyTop + 20}" x2="${cx + 44}" y2="${bodyTop + 26}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>`);
  }
  return P;
}

function monsterSVG(scene) {
  const P = [];
  const p = (n) => scene.parts[n];
  const cx = 150, bodyCy = 132, bodyRx = 42, bodyRy = 34;
  const headCy = bodyCy - bodyRy - 26, headR = 26;
  const skin = 'fill="var(--accent-soft)" stroke="var(--accent-ink)" stroke-width="2.2"';

  if (p("wings")) {
    const n = Math.min(p("wings").count, 2);
    for (let i = 0; i < n; i++) {
      const d = i === 0 ? -1 : 1;
      P.push(`<path d="M${cx + d * 20} ${bodyCy - 12} q${d * 52} -32 ${d * 40} 18 q${-d * 20} -6 ${-d * 40} -18 z" fill="var(--violet-soft)" stroke="var(--violet)" stroke-width="2"/>`);
    }
  }
  if (p("tail")) {
    P.push(`<path d="M${cx + bodyRx - 4} ${bodyCy + 10} q38 6 30 -30 q-4 22 -26 20" ${skin}/>`);
  }
  if (p("legs")) {
    const n = Math.min(p("legs").count, 6);
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 13 + i * 26;
      P.push(`<line x1="${x}" y1="${bodyCy + bodyRy - 6}" x2="${x}" y2="${GROUND - 4}" stroke="var(--accent-ink)" stroke-width="5" stroke-linecap="round"/>`);
      P.push(`<ellipse cx="${x}" cy="${GROUND - 2}" rx="9" ry="4" fill="var(--accent-ink)"/>`);
    }
  }
  if (p("arms")) {
    const n = Math.min(p("arms").count, 6);
    for (let i = 0; i < n; i++) {
      const d = i % 2 === 0 ? -1 : 1;
      const tier = Math.floor(i / 2) * 15;
      P.push(`<path d="M${cx + d * (bodyRx - 6)} ${bodyCy - 8 + tier} q${d * 30} -6 ${d * 34} -24" fill="none" stroke="var(--accent-ink)" stroke-width="5" stroke-linecap="round"/>`);
    }
  }
  if (p("body")) P.push(`<ellipse cx="${cx}" cy="${bodyCy}" rx="${bodyRx}" ry="${bodyRy}" ${skin}/>`);
  if (p("spots")) {
    const n = Math.min(p("spots").count, 8);
    for (let i = 0; i < n; i++) {
      P.push(`<circle cx="${cx - 24 + (i % 4) * 16}" cy="${bodyCy - 12 + Math.floor(i / 4) * 20}" r="5" fill="var(--violet)" opacity="0.7"/>`);
    }
  }
  if (p("head")) {
    P.push(`<line x1="${cx}" y1="${headCy + headR - 2}" x2="${cx}" y2="${bodyCy - bodyRy + 4}" stroke="var(--accent-ink)" stroke-width="6"/>`);
    P.push(`<circle cx="${cx}" cy="${headCy}" r="${headR}" ${skin}/>`);
  }
  if (p("horns")) {
    const n = Math.min(p("horns").count, 5);
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 11 + i * 22;
      P.push(`<polygon points="${x - 5},${headCy - headR + 4} ${x + 5},${headCy - headR + 4} ${x},${headCy - headR - 18}" fill="var(--amber)" stroke="var(--ink)" stroke-width="1.4"/>`);
    }
  }
  if (p("eyes")) {
    const n = Math.min(p("eyes").count, 6);
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 10 + i * 20;
      P.push(`<circle cx="${x}" cy="${headCy - 5}" r="7" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.6"/>`);
      P.push(`<circle cx="${x}" cy="${headCy - 4}" r="3" fill="var(--ink)"/>`);
    }
  }
  if (p("mouth")) {
    P.push(`<path d="M${cx - 13} ${headCy + 11} q13 11 26 0 z" fill="var(--fail)" stroke="var(--ink)" stroke-width="1.6"/>`);
    P.push(`<polygon points="${cx - 7},${headCy + 12} ${cx - 3},${headCy + 12} ${cx - 5},${headCy + 17}" fill="var(--surface)"/>`);
    P.push(`<polygon points="${cx + 3},${headCy + 12} ${cx + 7},${headCy + 12} ${cx + 5},${headCy + 17}" fill="var(--surface)"/>`);
  }
  return P;
}

/**
 * The drawing.
 *
 * The viewBox follows what got built rather than being fixed, because nothing
 * stops a student stacking six legs and a plume, and a fixed box silently
 * crops the top — the one thing they most need to look at is whether it came
 * out the shape they meant.
 */
export function sceneSVG(scene, subjectId) {
  const subj = subject(subjectId);
  const P = subj.id === "knight" ? knightSVG(scene) : monsterSVG(scene);

  const floats = [...new Set(scene.floating)];
  floats.forEach((f, i) => {
    const y = 44 + i * 20;
    P.push(`<circle cx="248" cy="${y - 4}" r="4" fill="none" stroke="var(--fail)" stroke-width="1.6" stroke-dasharray="2 2"/>`);
    P.push(`<text ${S({ x: 258, y, "font-family": "var(--mono)", "font-size": 10, fill: "var(--fail)" })}>${f}?</text>`);
  });

  const empty = !P.length;
  // Room for a plume, horns or a floating label, whichever reached highest.
  const top = Math.min(20, floats.length ? 28 : 40) - 60;
  const h = GROUND + 14 - top;
  return `<svg class="mon" viewBox="0 ${top} 300 ${h}" preserveAspectRatio="xMidYMax meet"
      role="img" aria-label="what these instructions built">
    <line x1="0" y1="${GROUND}" x2="300" y2="${GROUND}" stroke="var(--line-2)" stroke-width="1.5"/>
    ${P.join("")}
    ${empty ? `<text x="150" y="${GROUND - 70}" text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--muted)">nothing was built</text>` : ""}
  </svg>`;
}
