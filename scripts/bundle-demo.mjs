#!/usr/bin/env node
/**
 * bundle-demo.mjs — fold the built app into one self-contained HTML file.
 *
 *   npm run demo
 *
 * The deployed site and the shareable demo are the same codebase; this just
 * inlines the Vite output so the demo can be published as a Claude artifact,
 * where there is no server and no Supabase. src/lib/model.js already prefers
 * the viewer's own Claude when it finds one, so nothing here needs to patch
 * behaviour — it only moves bytes.
 *
 * `npm run demo` builds with --mode demo, which blanks the Supabase env vars
 * (.env.demo) so the artifact cannot write to the study database. The check
 * at the bottom of this file enforces that, because the day someone runs
 * `npm run build && node scripts/bundle-demo.mjs` by hand is the day a
 * published demo starts filing rows against real participant codes.
 *
 * Keeping one source of truth matters more than it sounds: the alternative is
 * hand-syncing two copies, and the copy people look at drifts from the copy
 * that ships.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist", "assets");
const out = process.argv[2] || join(root, "..", "demo", "day-three-station.html");

const files = readdirSync(dist);
const js = files.find((f) => f.endsWith(".js"));
const css = files.find((f) => f.endsWith(".css"));
if (!js || !css) { console.error("run `npm run build` first"); process.exit(2); }

const head = readFileSync(join(root, "index.html"), "utf8");
const body = head.slice(head.indexOf("<body>") + 6, head.lastIndexOf("<script"));
const fonts = head.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/)[0];

writeFileSync(out, `<title>CTx3</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${readFileSync(join(dist, css), "utf8")}
</style>
${body.trim()}
<script type="module">
${readFileSync(join(dist, js), "utf8")}
</script>
`);

/* A published demo that can write to the study database would file rows
   against real participant codes from anyone who opens the link. Refuse. */
const written = readFileSync(out, "utf8");
const leak = written.match(/https?:\/\/[a-z0-9-]+\.supabase\.co|sb_(publishable|secret)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
if (leak) {
  console.error("REFUSING: the demo carries a live credential (" + leak[0].slice(0, 32) + "…).");
  console.error("Build it with `npm run demo`, which uses --mode demo to blank them.");
  process.exit(3);
}
console.log("wrote " + out);
