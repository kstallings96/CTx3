#!/usr/bin/env node
/**
 * Does the Exact engine understand what the AI engine writes?
 *
 *   npm run audit:ai
 *   npm run audit:ai -- --runs 3 --site https://ct3-blue.vercel.app
 *
 * WHY THIS EXISTS. MonsterMaker's AI engine sends the student's instruction
 * to a model, gets numbered steps back, and then draws those steps WITH THE
 * EXACT ENGINE. So there are two ways a part can end up floating:
 *
 *   1. the model never said where it goes      <- the lesson, working
 *   2. the model said, and the engine misread  <- a bug, looking like 1
 *
 * The second is the dangerous one, because from a classroom it is invisible:
 * it reads as "the AI ignored the instructions", which is the thing the
 * activity is supposed to be demonstrating. A student is told the Exact
 * engine does exactly what the words say; when it cannot read a phrasing,
 * that claim is false and the lesson teaches the opposite of the truth.
 *
 * Two real rounds of this have been found and fixed by running it:
 *
 *   - `at the bottom of the body` and `coming from the body` floated, while
 *     `attached to the body` worked -- splitAt knew `to` and not `at`/`from`
 *   - `across the body` and `down the back` floated, for stripes and spikes
 *   - `two eyes in white ... on the head` floated, because "in white" looked
 *     like a location and hid the real one at the end of the line
 *
 * HOW TO READ THE OUTPUT. Every floated part is printed with the line that
 * produced it. Ask of each one: does that line say where the part goes? If
 * yes, it is a bug -- add the phrasing to check-engine.mjs and fix it. If
 * no, it is the engine being honest and the run is fine.
 *
 * It calls the DEPLOYED /api/complete, so it needs no key of its own, and it
 * costs whatever the model costs -- about a tenth of a cent for a full pass.
 */
import { buildPrompt, w4wRun } from "../src/w4w.js";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SITE = arg("site", "https://ct3-blue.vercel.app");
const RUNS = Math.max(1, parseInt(arg("runs", "2"), 10) || 2);

/* Instructions of the kind students actually write: vague ones, ones with
   placement already in them, and ones naming parts with no obvious anchor. */
const INSTRUCTIONS = [
  "a green monster with three eyes",
  "1 big green head\n1 big yellow eye on green head\npurple body\nred arms on body\nthree black legs on body",
  "make a tall blue monster with wings and a tail",
  "a spiky orange monster",
  "small round pink body, two tiny ears, a big mouth with teeth",
  "a monster with stripes and six legs",
  "draw something scary but friendly",
  "a white monster with huge horns and a long tail",
];
/* Facilitator keys, rotated: api/complete.js rate-limits per participant
   code at 40 calls a minute and a full pass can exceed that on one. */
const CODES = ["KSS03", "KSS11", "KSS17", "KSS18", "SAM12", "SAM14", "SAM16"];

let calls = 0, failed = 0;
const floated = [];

for (const instr of INSTRUCTIONS) {
  for (let k = 0; k < RUNS; k++) {
    let text = "";
    try {
      const r = await fetch(SITE + "/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt(instr), participantCode: CODES[calls % CODES.length] }),
      });
      const j = await r.json();
      text = String(j.text ?? j.output ?? j.completion ?? "").trim();
      if (!text) { failed++; console.log("  no text: " + JSON.stringify(j).slice(0, 120)); }
    } catch (e) {
      failed++; console.log("  unreachable: " + (e?.message || e));
    }
    calls++;
    if (!text) continue;

    const res = w4wRun(text);
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    for (const part of [...new Set(res.scene.floating)]) {
      const stem = part.replace(/s$/, "");
      const line = lines.find((l) => new RegExp("\\b" + stem + "s?\\b", "i").test(l)) || "(line not found)";
      floated.push({ part, line, instr: instr.split("\n")[0].slice(0, 32) });
    }
  }
}

console.log(`\n${calls} calls` + (failed ? `, ${failed} with no usable reply` : ""));
if (!floated.length) {
  console.log("\nNothing floated. Every part the model named, the engine placed.");
} else {
  console.log(`\n${floated.length} floated part(s). For each: DOES THE LINE SAY WHERE IT GOES?`);
  console.log("If it does, that is a bug -- pin the phrasing in check-engine.mjs and fix it.\n");
  for (const f of floated) console.log(`  [${f.part}]  ${f.line}`);
}
/* Exit 0 either way. Floating is not automatically wrong, and a check that
   cried failure every time the model declined to say where a tail goes
   would be ignored within a week. This reports; a person judges. */
