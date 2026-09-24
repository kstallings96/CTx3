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
import { w4wRun, w4wCheck, PARTS } from "../src/w4w.js";

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

console.log(failures
  ? `\n${failures} FAILURE(S)`
  : "\nThe engine does what the lines say, and says what it did.");
process.exit(failures ? 1 : 0);
