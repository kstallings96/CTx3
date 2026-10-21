#!/usr/bin/env node
/**
 * monsters.mjs — redraw every monster in an event log, as one HTML sheet.
 *
 *   node scripts/monsters.mjs <log.json> [--out monsters.html] [--open]
 *   npm run monsters -- data.json
 *
 * <log.json> is any of the three shapes rescore.mjs accepts: the hidden JSON
 * export from a device ({participantCode, events:[...]}), a bare array of
 * event rows, or a Supabase dump of the `events` table. Pull one with:
 *
 *   select * from events
 *   where instrument = 'ctx3' and tool = 'monstermaker'
 *   order by participant_code, seq;
 *
 * WHAT IT IS FOR. No picture of a monster is ever stored. What is stored is
 * `sceneSignature` -- one short string per monster, six colon-separated
 * fields per part -- and the engine can turn that back into the exact same
 * drawing. check-engine.mjs asserts that round trip byte for byte on every
 * test case, which is what makes this script possible rather than
 * approximate. So a month after the pilot you can still see what every
 * student actually built, and what the AI built from the same words.
 *
 * It reads two kinds of row:
 *
 *   instruction_executed   the student's OWN build, in the warm-up
 *   engine_run_complete    five runs of one instruction through an engine,
 *                          plus what the AI inferred that nobody asked for
 *
 * Nothing here calls a model or a network. It is a pure redraw of rows you
 * already have.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { freshScene, sceneSVG, sceneSignature } from "../src/w4w.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outAt = args.indexOf("--out");
const out = outAt >= 0 && args[outAt + 1] ? args[outAt + 1] : "monsters.html";

if (!file) {
  console.error("usage: node scripts/monsters.mjs <log.json> [--out monsters.html]");
  console.error("       the log is a device export, an array of rows, or a Supabase dump");
  process.exit(2);
}

/* ---- the three shapes a log arrives in, normalised exactly as rescore ---- */
const raw = JSON.parse(readFileSync(file, "utf8"));
let events = Array.isArray(raw) ? raw : raw.events ?? raw.rows ?? [];
if (!Array.isArray(events)) { console.error("no events array found in " + file); process.exit(2); }
events = events.map((e, i) => ({
  seq: e.seq ?? i + 1,
  ts: e.ts ?? e.client_ts ?? e.clientTs ?? null,
  type: e.type,
  participantCode: e.participantCode ?? e.payload?.participantCode ?? e.participant_code ?? null,
  payload: e.payload ?? e,
}));

/**
 * A signature back into a scene.
 *
 * The inverse of sceneSignature, and it has to stay the inverse: `~` in the
 * `on` field means the part was drawn but unplaced, and dropping that would
 * quietly lose every underspecified instruction -- which is the category
 * the whole activity is about.
 */
function rebuild(sig) {
  const s = freshScene();
  if (!sig) return s;
  for (const chunk of String(sig).split("|")) {
    const [name, on, count, color, size, shape] = chunk.split(":");
    if (!name) continue;
    const part = {
      on: (on === "-" || on === "~" || on === undefined) ? null : on,
      count: Number(count) || 1,
      color: color === "-" ? null : color,
      size: size === "-" ? null : size,
      shape: shape === "-" ? null : shape,
    };
    if (on === "~") { s.loose[name] = part; s.floating.push(name); }
    else { s.parts[name] = part; s.order.push(name); }
  }
  return s;
}

const esc = (x) => String(x ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** One drawing plus its caption. */
function card(sig, caption, note) {
  const scene = rebuild(sig);
  const floating = scene.floating.length;
  return `<figure class="m${floating ? " floats" : ""}">
    ${sceneSVG(scene)}
    <figcaption>${esc(caption)}${note ? `<span>${esc(note)}</span>` : ""}
    ${floating ? `<span class="fl">${floating} part${floating === 1 ? "" : "s"} with nowhere to go</span>` : ""}
    </figcaption></figure>`;
}

/* ---- gather, grouped by student ---------------------------------------- */
const byStudent = new Map();
const add = (code, item) => {
  const k = code || "(no code)";
  if (!byStudent.has(k)) byStudent.set(k, []);
  byStudent.get(k).push(item);
};

let built = 0, skipped = 0;
for (const e of events) {
  const p = e.payload || {};
  if (e.type === "instruction_executed" && p.monster) {
    add(e.participantCode, { kind: "own", sig: p.monster, seq: e.seq, ts: e.ts });
    built++;
  } else if (e.type === "engine_run_complete" && Array.isArray(p.monsters)) {
    add(e.participantCode, {
      kind: "engine", engine: p.engine, instruction: p.instruction,
      sigs: p.monsters, inferred: p.inferred || [], seq: e.seq, ts: e.ts,
      distinct: p.distinctMonsters,
    });
    built += p.monsters.length;
  } else if (e.type === "instruction_executed" || e.type === "engine_run_complete") {
    /* A row from before the monster was recorded. Counted and reported
       rather than ignored, because "the sheet looks thin" should have an
       answer that is not "maybe the script is broken". */
    skipped++;
  }
}

const sections = [...byStudent.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, items]) => {
  const body = items.map((it) => {
    if (it.kind === "own") {
      return `<div class="run"><h3>their own build <span class="seq">#${it.seq}</span></h3>
        <div class="row">${card(it.sig, "what the steps drew")}</div></div>`;
    }
    const name = it.engine === "ai" ? "AI engine" : "Exact engine";
    const cards = it.sigs.map((s, i) =>
      card(s, "run " + (i + 1), it.inferred[i] ? "added: " + it.inferred[i].replace(/\+/g, ", ") : "")).join("");
    return `<div class="run"><h3>${esc(name)} <span class="seq">#${it.seq}</span>
        <span class="tally">${it.distinct} different out of ${it.sigs.length}</span></h3>
      ${it.instruction ? `<pre>${esc(it.instruction).replace(/ \/ /g, "\n")}</pre>` : ""}
      <div class="row">${cards}</div></div>`;
  }).join("");
  return `<section><h2>${esc(code)}</h2>${body}</section>`;
}).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monsters — The Machine Lab</title>
<style>
  :root{--bg:#f6f7f4;--surface:#fff;--line:#dfe3da;--line-2:#c3cbba;--ink:#1d2419;
        --ink-2:#44503c;--muted:#6f7c66;--accent:#2e7d52;--accent-ink:#1e6b4a;
        --leaf:#3d9e6e;--leaf-ink:#1e6b4a;--fail:#a04030;--mono:ui-monospace,Menlo,Consolas,monospace}
  *{box-sizing:border-box}
  body{margin:0;padding:28px 20px 60px;background:var(--bg);color:var(--ink);
       font:15px/1.5 system-ui,sans-serif}
  header{max-width:1100px;margin:0 auto 26px}
  h1{font-size:26px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:13.5px}
  section{max-width:1100px;margin:0 auto 26px;background:var(--surface);
          border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  h2{font-family:var(--mono);font-size:17px;margin:0 0 12px;letter-spacing:.08em;
     color:var(--accent-ink)}
  .run{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}
  .run:first-of-type{border-top:0;margin-top:0;padding-top:0}
  h3{font-size:13.5px;margin:0 0 8px;font-weight:600;color:var(--ink-2)}
  .seq{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:400}
  .tally{float:right;font-size:12px;color:var(--accent-ink);font-weight:700}
  pre{font-family:var(--mono);font-size:12px;background:#eef2ea;border:1px solid var(--line);
      border-radius:8px;padding:9px 11px;margin:0 0 10px;white-space:pre-wrap;color:var(--ink-2)}
  .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
  .m{margin:0;display:flex;flex-direction:column;gap:4px}
  .m svg{width:100%;height:auto;background:#eef2ea;border:1.5px solid var(--line);border-radius:8px}
  .m.floats svg{border-color:var(--fail)}
  figcaption{font-size:11px;color:var(--muted);text-align:center;line-height:1.35;
             display:flex;flex-direction:column}
  figcaption span{font-family:var(--mono);font-size:10px}
  .fl{color:var(--fail)}
  @media print{body{background:#fff}section{break-inside:avoid}}
</style></head><body>
<header>
  <h1>Monsters</h1>
  <p class="sub">${built} drawing${built === 1 ? "" : "s"} from ${byStudent.size} participant${byStudent.size === 1 ? "" : "s"},
  redrawn from the event log. No pictures were stored — each one is rebuilt from its
  signature, which <code>check-engine.mjs</code> proves redraws byte-identically.
  A red border means parts were drawn with nowhere to attach.${
    skipped ? ` <strong>${skipped} row${skipped === 1 ? "" : "s"} carried no monster</strong> — logged before monsters were recorded.` : ""}</p>
</header>
${sections || "<section><p>No monsters in this log.</p></section>"}
</body></html>`;

writeFileSync(out, html);
console.log(`${built} monster(s) from ${byStudent.size} participant(s) -> ${out}`);
if (skipped) console.log(`${skipped} row(s) had no monster recorded (logged before that was added).`);
if (!built) {
  console.log("\nNothing to draw. The log needs instruction_executed or engine_run_complete");
  console.log("rows carrying `monster` / `monsters` — those arrived on 2026-10-21.");
}
