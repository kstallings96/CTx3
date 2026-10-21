#!/usr/bin/env node
/**
 * Does the Exact engine say true things?
 *
 *   npm run check:engine
 *
 * This engine's whole claim is that it does only what the line says. That
 * makes its OUTPUT part of the claim: a log that contradicts itself is the
 * same failure as a drawing that ignores you, and a student reading
 * carefully is exactly who catches it. Three bugs in three days were of
 * that shape, all found by eye in a screenshot rather than here:
 *
 *   - "add head to yellow body" floated, because the location pattern read
 *     the first word after the preposition and "yellow" is not a part.
 *   - line 1 drew a head, line 2 said "there is no head yet".
 *   - a re-mentioned part ended up in `parts` AND `floating` at once, so
 *     the picture showed a head with a ghost of itself hovering above.
 *
 * None of those were caught by "does it build the right monster", because
 * the monster is the student's business. What this checks is narrower and
 * mechanical: the engine must never claim two incompatible things.
 */
import { w4wRun, w4wCheck, PARTS, sceneSignature, sceneSVG, freshScene } from "../src/w4w.js";

let failures = 0;
const fail = (what, detail) => {
  failures++;
  console.log(`  FAIL  ${what}\n        ${detail}`);
};

/* Instructions a thirteen-year-old actually writes, including the awkward
   ones. Each says what SHOULD end up on the page. */
const CASES = [
  { t: "1. Draw a round green body.\n2. Add a head to the body.\n3. Add two eyes to the head.",
    drew: ["body", "head", "eyes"] },
  { t: "big green head\nattach small yellow body to head\ntwo eyes on the head on stalks",
    drew: ["head", "body", "eyes"] },
  { t: "1. Draw a yellow body.\n2. Add head to yellow body.\n3. Add two eyes to the head.",
    drew: ["body", "head", "eyes"] },
  { t: "1. Draw a body.\n2. On the body, draw a head.\n3. On the head, add two eyes.",
    drew: ["body", "head", "eyes"] },
  { t: "1. Draw a big purple body.\n2. Put a small green head on the body.\n3. Add four eyes to the head.\n4. Add a tail to the body.",
    drew: ["body", "head", "eyes", "tail"] },
  // Underspecified on purpose: these SHOULD leave things floating.
  { t: "1. Draw a round green body.\n2. Add a head.\n3. Add two eyes.",
    drew: ["body"], floats: ["head", "eyes"] },
  { t: "1. Draw a body.\n2. Add two big red eyes to the head.",
    drew: ["body"], floats: ["eyes"] },
  // A part named twice, the second time with a target that does not exist.
  { t: "big green head\nadd head to yellow body",
    drew: ["head"] },

  /* READING THE WHOLE LINE.
   *
   * Each of these said where a part goes and got told "you did not say
   * where it goes" -- the machine split the sentence and then only read one
   * of the halves. That is a parsing failure, not the lesson: the student
   * had said, in words they typed, and the engine has to obey what is
   * written. None of these makes it GUESS; the last case below is the
   * guard on that. */
  // A target at the end of the line belongs to everything in the list.
  { t: "1. Draw a green body.\n2. Add a head to the body.\n3. add two big red eyes and a small green mouth to the head",
    drew: ["body", "head", "eyes", "mouth"] },
  { t: "1. Draw a body.\n2. Add a head, two eyes and a mouth to the body.",
    drew: ["body", "head", "eyes", "mouth"] },
  // "with" says where. It used to be split away like "and" and the part
  // after it was left hanging next to the thing it belongs to.
  { t: "Draw a round green body with four legs.",
    drew: ["body", "legs"] },
  // "with" opens a list; the "and" continues it.
  { t: "Draw a body with a head and two eyes.",
    drew: ["body", "head", "eyes"] },
  // Nested: the mouth goes on the body, the teeth go on the mouth. The
  // trailing phrase sits next to the teeth and belongs to the mouth.
  { t: "1. Draw a purple body.\n2. Add a mouth with five teeth to the body.",
    drew: ["body", "mouth", "teeth"] },
  // AND STILL NO GUESSING. Nothing above may turn into "eyes obviously go
  // on the head" -- a line that does not say where still floats, which is
  // the whole contrast the compare panel rests on.
  { t: "1. Draw a green body.\n2. Add a head to the body.\n3. Add two eyes.",
    drew: ["body", "head"], floats: ["eyes"] },

  /* EVERY WAY OF SAYING WHERE.
   *
   * These are verbatim lines the AI engine's model produced, and three of
   * the four used to float the legs. `splitAt` knew "to" and not "at" or
   * "from", so "legs AT the bottom of the body" read as a line that never
   * said where they go -- and from a classroom it looked like the AI
   * ignoring its instructions, when it had said where every part went in
   * five runs out of five.
   *
   * A student is told the Exact engine does exactly what the words say. If
   * the engine can only read some of the ways English says it, that claim
   * is false and the student who notices is right. */
  { t: "1. Draw a big green round head.\n2. Add one big yellow eye on the green head.\n3. Draw a purple square body connected to the green head.\n4. Attach two red arms on either side of the purple body.\n5. Add three black legs at the bottom of the purple body.",
    drew: ["head", "eyes", "body", "arms", "legs"] },
  { t: "1. Draw a big green round head.\n2. Draw a purple wide body attached to the bottom of the green head.\n3. Draw three black legs coming from the bottom of the purple body.",
    drew: ["head", "body", "legs"] },
  { t: "1. Draw a body.\n2. Add two eyes near the top of the body.",
    drew: ["body", "eyes"] },
  /* "between the eyes" is read as a placement -- and the eyes were never
     drawn, so the mouth floats. That is correct and worth pinning: widening
     the vocabulary must not also start inventing anchors. The line pointed
     at something that is not on the page, and the honest answer is to draw
     the mouth with nowhere to go rather than to guess at the head. */
  { t: "1. Draw a body.\n2. Draw a head above the body.\n3. Add a mouth between the eyes and the chin.",
    drew: ["body", "head"], floats: ["mouth"] },

  /* More verbatim model output, from an audit of sixteen live runs. */
  // "in white" is a COLOUR, not a location. Reading it as one made the
  // piece look like it had already said where it goes, so the real
  // placement at the end of the line never reached the eyes.
  { t: "1. Draw a body.\n2. Draw a head on the body.\n3. Add two big, friendly eyes in white with black pupils on the head.",
    drew: ["body", "head", "eyes"] },
  // A place word with nothing after it points at the thing just named.
  { t: "1. Draw a body.\n2. Draw a head on the body.\n3. Draw a wide mouth on the head, and add three big, white teeth inside.",
    drew: ["body", "head", "mouth", "teeth"] },
  // Stripes and spikes, which the model places with "across" and "down".
  { t: "1. Draw a big orange body.\n2. Add three colorful stripes across the body.",
    drew: ["body", "stripes"] },
  { t: "1. Draw a big orange body.\n2. Draw three colorful spikes down the back of the body.",
    drew: ["body", "spikes"] },
  /* An "and" INSIDE a location. This used to split the address in half,
     draw a second head out of the orphan "top right sides of the head",
     and float the ears whose location had just been truncated. One line,
     two wrong answers, and a stray head on the page to show for it. */
  { t: "1. Draw a body.\n2. Draw a head on the body.\n3. Attach two tiny round ears on the top left and top right sides of the head.",
    drew: ["body", "head", "ears"] },

  /* THE GUARDS. Everything above widens what counts as a placement, and
     none of it may turn into the engine inventing one. A line that names no
     place word, and a line pointing at a part that was never drawn, both
     still float -- which is the contrast the whole compare panel rests on. */
  { t: "1. Draw a body.\n2. Add two eyes to the head.",
    drew: ["body"], floats: ["eyes"] },
];

for (const c of CASES) {
  const r = w4wRun(c.t);
  const parts = Object.keys(r.scene.parts);
  const floats = [...new Set(r.scene.floating)];
  const label = JSON.stringify(c.t.replace(/\n/g, " / "));

  // 1. NOTHING IS BOTH DRAWN AND FLOATING. This is the invariant behind the
  //    ghost-head bug, and it is not a matter of taste.
  const both = parts.filter((p) => floats.includes(p));
  if (both.length) fail(`${label}\n        a part is drawn AND floating`, both.join(", "));

  // 2. What landed matches what the instruction actually placed.
  const want = (c.drew || []).slice().sort().join(",");
  const got = parts.slice().sort().join(",");
  if (want !== got) fail(`${label}\n        drew the wrong set`, `want [${want}] got [${got}]`);

  if (c.floats) {
    const wf = c.floats.slice().sort().join(",");
    const gf = floats.slice().sort().join(",");
    if (wf !== gf) fail(`${label}\n        floated the wrong set`, `want [${wf}] got [${gf}]`);
  }

  // 3. THE LOG MUST NOT CONTRADICT THE SCENE. If a message says a part has
  //    not been drawn, it had better not be on the page by then.
  r.log.forEach((step, i) => {
    const m = step.msg.match(/the (\w+) has not been drawn yet/);
    if (!m) return;
    const drawnBy = w4wRun(c.t.split("\n").slice(0, i + 1).join("\n")).scene.parts;
    if (drawnBy[m[1]])
      fail(`${label}\n        line ${i + 1} says "${m[1]} has not been drawn" but it had been`,
        step.msg);
  });

  // 4. Every step says something. "Okay!" for a line naming a real part was
  //    the machine looking agreeable about a line it threw away.
  r.log.forEach((step, i) => {
    if (/^Okay!$/.test(step.msg) && Object.keys(PARTS).some((p) => step.line.includes(p)))
      fail(`${label}\n        line ${i + 1} names a part and got "Okay!"`, step.line);
  });

  const state = parts.length ? parts.join(", ") : "nothing";
  console.log(`ok   ${state.padEnd(28)} ${floats.length ? "floating: " + floats.join(", ") : ""}`);
}

/* Determinism is the engine's other claim, and the entire reason it is the
   control the AI is measured against. */
for (const c of CASES.slice(0, 3)) {
  const a = JSON.stringify(w4wRun(c.t).scene);
  for (let i = 0; i < 5; i++)
    if (JSON.stringify(w4wRun(c.t).scene) !== a)
      fail("the same instruction built a different monster", c.t.replace(/\n/g, " / "));
}
console.log("ok   deterministic          same words in, same monster out, 5 times");

/* THE SIGNATURE MUST REBUILD THE DRAWING.
 *
 * `sceneSignature` is what the event log stores for every monster -- it is
 * how "what did this student make" gets answered months later, without
 * keeping a picture per run. That only holds if the string is COMPLETE:
 * parse it back, render it, and get the same drawing byte for byte.
 *
 * It did not hold once. Floating parts were left out, so a run whose arms
 * hung unattached hashed identically to a run with no arms -- a redraw
 * would have silently dropped them, and `distinctMonsters` counted two
 * different pictures as one. This is the check that would have caught it. */
function rebuildFromSignature(sig) {
  const s = freshScene();
  if (!sig) return s;
  for (const chunk of sig.split("|")) {
    const [name, on, count, color, size, shape] = chunk.split(":");
    const part = { on: (on === "-" || on === "~") ? null : on, count: Number(count),
      color: color === "-" ? null : color, size: size === "-" ? null : size,
      shape: shape === "-" ? null : shape };
    if (on === "~") { s.loose[name] = part; s.floating.push(name); }
    else { s.parts[name] = part; s.order.push(name); }
  }
  return s;
}
for (const c of CASES) {
  const scene = w4wRun(c.t).scene;
  const sig = sceneSignature(scene);
  const back = rebuildFromSignature(sig);
  if (sceneSignature(back) !== sig)
    fail("a signature did not survive a round trip", sig + "  ->  " + sceneSignature(back));
  else if (sceneSVG(back) !== sceneSVG(scene))
    fail("a rebuilt signature drew a different picture",
      c.t.replace(/\n/g, " / ") + "\n        " + sig);
}
console.log(`ok   signature round trip   ${CASES.length} monsters redrawn byte-identical from the log`);

console.log(failures
  ? `\n${failures} FAILURE(S)`
  : "\nThe engine does what the lines say, and says what it did.");
process.exit(failures ? 1 : 0);
