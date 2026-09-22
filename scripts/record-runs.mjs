#!/usr/bin/env node
/**
 * Capture the reveal's runs from a real model.
 *
 *   npm run record -- --key sk-or-...            # uses the default model
 *   npm run record -- --key sk-or-... --model anthropic/claude-haiku-4.5
 *   npm run record -- --key sk-or-... --rule never_dogs      # just one
 *
 * src/recordings.js ships with AUTHORED examples and `captured: false`. The
 * reveal labels them "example runs" until this script replaces them, because
 * the lesson is that AI follows instructions unreliably and teaching it with
 * invented evidence would be the same failure the lesson warns about.
 *
 * This sends each rule's system prompt and question to the model five times
 * with caching off, marks each run against the rule's own checker, writes the
 * transcripts back, and sets `captured: true` with the date and model.
 *
 * It does NOT retry to hit a particular ratio. If a model follows the
 * instruction five times out of five, that is the finding and the reveal
 * should say so — a tally cooked to look good is worse than no tally.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, RULE_ORDER } from "../src/rules.js";
import { RECORDINGS } from "../src/recordings.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "recordings.js");

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const key = arg("key", process.env.OPENROUTER_API_KEY);
const model = arg("model", "anthropic/claude-haiku-4.5");
const only = arg("rule", null);

if (!key) {
  console.error("No key. Pass --key sk-or-... or set OPENROUTER_API_KEY.");
  console.error("The key is never written to disk by this script.");
  process.exit(2);
}

async function ask(systemPrompt, question) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "X-Title": "CTx3 record" },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      // The point is the variation between identical calls, so temperature
      // is pinned rather than left to the provider.
      temperature: 1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });
  if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim().replace(/\s+/g, " ");
}

const out = { ...RECORDINGS };
const rules = only ? [only] : RULE_ORDER;

for (const id of rules) {
  const rule = RULES[id];
  const spec = RECORDINGS[id];
  if (!rule || !spec) { console.error("Unknown rule: " + id); process.exit(2); }
  console.log("\n" + id);
  console.log("  system:   " + rule.systemPrompt);
  console.log("  question: " + spec.question);
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const text = await ask(rule.systemPrompt, spec.question);
    // Marked by the rule's OWN checker, the same one the practice bot is
    // held to, so "followed" means the same thing in both halves.
    const followed = rule.check(text);
    runs.push({ text, followed });
    console.log(`  ${i + 1}. ${followed ? "kept it " : "BROKE it"}  ${text.slice(0, 96)}`);
  }
  out[id] = { question: spec.question, runs };
  console.log(`  -> followed ${runs.filter((r) => r.followed).length} of 5`);
}

out.captured = true;
out.capturedAt = new Date().toISOString().slice(0, 10);
out.model = model;

/* Rewrite the data while leaving the file's explanation intact. */
const src = readFileSync(OUT, "utf8");
const head = src.slice(0, src.indexOf("export const RECORDINGS"));
const tail = src.slice(src.indexOf("/** How many of the five followed"));
const body = "export const RECORDINGS = " + JSON.stringify(out, null, 2) + ";\n\n";
writeFileSync(OUT, head + body + tail);

console.log("\nwrote " + OUT);
console.log("captured: true  model: " + model);
console.log("The reveal will now describe these as real recordings rather than examples.");
