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
console.log("wrote " + out);
