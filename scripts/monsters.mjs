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

/* ---- the three shapes a log arrives in, normalised exactly as rescore ----
 *
 * The read is wrapped because the raw ENOENT stack trace is useless to the
 * person who will actually hit this. `npm run` sets the working directory to
 * the PACKAGE ROOT, so `npm run monsters -- log.json` typed from inside
 * scripts/ looks for ctx3/log.json and throws forty lines of node internals
 * at someone whose only mistake was standing in the wrong folder. */
let raw;
try {
  /* STRIP THE BYTE ORDER MARK.
   *
   * Windows PowerShell's `Set-Content -Encoding utf8` writes one, and so
   * does Notepad saving as UTF-8 -- both of which are the obvious ways to
   * get a copied query result into a file. JSON.parse then fails on an
   * invisible first character, and the error it produces points at JSON
   * validity, which sends the reader hunting through their data for a
   * problem that is not there. Three characters here, one fewer dead end. */
  raw = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
} catch (err) {
  if (err.code === "ENOENT") {
    console.error(`Could not find: ${err.path || file}\n`);
    console.error("`npm run` always resolves paths from the project root, whatever");
    console.error("folder you typed it in. So either move the file there, or give");
    console.error("the full path:\n");
    console.error("  npm run monsters -- C:\\path\\to\\log.json");
  } else if (err instanceof SyntaxError) {
    console.error(`${file} is not valid JSON.\n`);
    console.error("A Supabase CSV download will not work — pick JSON in the export");
    console.error("menu, or paste the query result as JSON.\n");
    console.error("  " + err.message);
  } else {
    console.error(`Could not read ${file}: ${err.message}`);
  }
  process.exit(2);
}
let events = Array.isArray(raw) ? raw : raw.events ?? raw.rows ?? [];
if (!Array.isArray(events)) { console.error("no events array found in " + file); process.exit(2); }
events = events.map((e, i) => ({
  seq: e.seq ?? i + 1,
  ts: e.ts ?? e.client_ts ?? e.clientTs ?? null,
  type: e.type,
  participantCode: e.participantCode ?? e.payload?.participantCode ?? e.participant_code ?? null,
  /* `seq` RESTARTS AT 1 IN EVERY SESSION, so it orders events only within
     one. The session is what makes it unique, and it is needed for more
     than sorting -- see the pairing below. */
  sessionId: e.session_id ?? e.sessionId ?? e.deviceId ?? e.device_id ?? null,
  payload: e.payload ?? e,
}));

/* PUT THEM IN THE ORDER THEY HAPPENED.
 *
 * A Supabase dump comes back ordered by whatever the query said -- for the
 * one in DEPLOY.md, participant then seq. With `seq` restarting each
 * session, that interleaves two sittings of the same student: two rows both
 * numbered 9, from different afternoons, landing next to each other.
 *
 * That is not cosmetic. The text of an instruction and the monster it drew
 * are on separate rows, paired by "the most recent text before this
 * drawing" -- and out of order, a build was captioned with words typed in a
 * different session. The sheet showed a purple monster above an instruction
 * that described a green one, which is worse than showing no words at all.
 * Sorting by timestamp, with seq to break ties inside a session, restores
 * the real sequence whatever the query asked for. */
events.sort((a, b) =>
  String(a.ts ?? "").localeCompare(String(b.ts ?? "")) || (a.seq ?? 0) - (b.seq ?? 0));

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
/**
 * One drawing plus its caption.
 *
 * THE STORED SVG WINS. From 5 November the run records the picture it put
 * on screen, so that is the one to show: it is what the student saw, and no
 * later fix to the drawing code can alter it. Only when a row predates that
 * -- or somehow lost it -- is the scene rebuilt from its signature and
 * redrawn with today's engine, which is a reconstruction of the parse
 * rather than a record of the screen. The two are marked differently,
 * because a sheet that mixes them silently is how "this isn't what was
 * produced in gameplay" becomes impossible to answer.
 */
let recorded = 0, redrawn = 0;
function card(sig, caption, note, storedSvg) {
  const scene = rebuild(sig);
  const floating = scene.floating.length;
  const real = typeof storedSvg === "string" && storedSvg.startsWith("<svg");
  if (real) recorded++; else redrawn++;
  const svg = real
    ? storedSvg.replace("<svg", `<svg role="img" aria-label="${esc(caption)}"`)
    : sceneSVG(scene);
  return `<figure class="m${floating ? " floats" : ""}${real ? "" : " redraw"}">
    ${svg}
    <figcaption>${esc(caption)}${note ? `<span>${esc(note)}</span>` : ""}
    ${floating ? `<span class="fl">${floating} part${floating === 1 ? "" : "s"} with nowhere to go</span>` : ""}
    ${real ? "" : `<span class="rd" title="No picture was stored for this run; redrawn from the scene with today's engine.">redrawn</span>`}
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
/* THE WORDS THAT PRODUCED THE DRAWING, carried forward to it.
 *
 * `instruction_executed` records the monster but not the text -- the text is
 * on the `instruction_submitted` (or `attempt_submitted`) row just before it.
 * Without pairing them the sheet shows a picture with no way to tell whether
 * the engine misread the student or the student wrote something the engine
 * does not know, and the first guess is always that the tool is broken.
 *
 * It is a real distinction. "Green big human shape with alien looking ears
 * and a big nose with spiky fur" drew two ears and a nose, floating -- which
 * is exactly right: "human shape" and "spiky fur" name no part the machine
 * has, and nothing in the line said where the ears or the nose go. Shown
 * next to the drawing that reads as a lesson. Shown without it, it reads as
 * a bug. */
const lastText = new Map();
for (const e of events) {
  const p = e.payload || {};
  const text = p.text ?? p.artifact ?? null;
  /* Keyed by SESSION. Two sittings of the same student are two threads of
     work, and the text from one must never caption a drawing from the
     other -- which is exactly what keying on the participant allowed. */
  const thread = e.sessionId ?? e.participantCode;
  if (text && (e.type === "instruction_submitted" || e.type === "attempt_submitted"))
    lastText.set(thread, String(text));

  if (e.type === "instruction_executed" && p.monster) {
    add(e.participantCode, { kind: "own", sig: p.monster, seq: e.seq, ts: e.ts,
      svg: typeof p.svg === "string" ? p.svg : null,
      instruction: lastText.get(thread) || null,
      floating: Array.isArray(p.partsFloating) ? p.partsFloating : [],
      placed: Array.isArray(p.partsPlaced) ? p.partsPlaced : [] });
    built++;
  } else if (e.type === "engine_run_complete" && Array.isArray(p.monsters)) {
    add(e.participantCode, {
      kind: "engine", engine: p.engine, instruction: p.instruction,
      sigs: p.monsters, svgs: Array.isArray(p.svgs) ? p.svgs : [],
      inferred: p.inferred || [], seq: e.seq, ts: e.ts,
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

/* WHEN THIS LOG IS FROM, stated at the top.
 *
 * A sheet that does not say its own date looks exactly like a sheet of the
 * wrong data: you run the tool, open the file, and see monsters you do not
 * recognise, with nothing on the page to tell you the export is three weeks
 * old. That happened, and the time went on doubting the script rather than
 * re-exporting. The range makes it a one-second check. */
const stamps = events.map((e) => e.ts).filter(Boolean).sort();
const day = (t) => String(t).slice(0, 10);
const span = stamps.length
  ? (day(stamps[0]) === day(stamps[stamps.length - 1])
      ? day(stamps[0])
      : `${day(stamps[0])} to ${day(stamps[stamps.length - 1])}`)
  : "no timestamps in this log";

const sections = [...byStudent.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, items]) => {
  const body = items.map((it) => {
    if (it.kind === "own") {
      /* Name the parts that floated, rather than only counting them. "2
         parts with nowhere to go" next to a picture of two ears and a nose
         invites the reader to wonder which two; saying "ears, nose" closes
         it, and sits right under the words that did not place them. */
      const floats = [...new Set(it.floating || [])];
      return `<div class="run"><h3>their own build <span class="seq">#${it.seq}</span></h3>
        ${it.instruction ? `<pre>${esc(it.instruction).replace(/ \/ /g, "\n")}</pre>` : ""}
        <div class="row">${card(it.sig, "what the steps drew", "", it.svg)}</div>
        ${floats.length ? `<p class="note">Nothing in those words said where the
          <b>${esc(floats.join(", "))}</b> go, so ${floats.length === 1 ? "it was" : "they were"}
          drawn loose. Any word the engine does not know as a part is ignored.</p>` : ""}
      </div>`;
    }
    const name = it.engine === "ai" ? "AI engine" : "Exact engine";
    const cards = it.sigs.map((s, i) =>
      card(s, "run " + (i + 1),
        it.inferred[i] ? "added: " + it.inferred[i].replace(/\+/g, ", ") : "",
        it.svgs[i])).join("");
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
  .when{font-family:var(--mono);font-size:12px;color:var(--ink-2);margin:0 0 8px;
        background:#eef2ea;border:1px solid var(--line);border-radius:7px;padding:7px 10px;display:inline-block}
  .when code{font-size:11px;color:var(--muted)}
  .caveat{font-size:12.5px;color:var(--ink-2);background:#f3f1e6;border:1px solid #e2ddc4;
          border-radius:8px;padding:9px 12px;margin:10px 0 0;line-height:1.5;max-width:1100px}
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
  .rd{color:#8a7a3c;font-style:italic}
  .m.redraw svg{border-style:dashed}
  .note{font-size:12px;color:var(--ink-2);background:#f3f1e6;border:1px solid #e2ddc4;
        border-radius:7px;padding:7px 10px;margin:10px 0 0;line-height:1.45}
  @media print{body{background:#fff}section{break-inside:avoid}}
</style></head><body>
<header>
  <h1>Monsters</h1>
  <p class="when">events from <b>${esc(span)}</b> &nbsp;·&nbsp; sheet made ${new Date().toISOString().slice(0, 16).replace("T", " ")}
    &nbsp;·&nbsp; <code>${esc(file)}</code></p>
  <p class="sub">${built} drawing${built === 1 ? "" : "s"} from ${byStudent.size} participant${byStudent.size === 1 ? "" : "s"}.
  A red border means parts were drawn with nowhere to attach.${
    skipped ? ` <strong>${skipped} row${skipped === 1 ? "" : "s"} carried no monster</strong> — logged before monsters were recorded.` : ""}</p>
  ${/* THE HONEST CAVEAT, not buried. No picture is stored: what is stored is
        the SCENE the engine understood, and these are redrawn from it with
        TODAY'S drawing code. That makes them a reconstruction, not a
        recording, and the difference is not academic -- a rendering bug
        fixed after a session changes what its monsters look like here. It
        happened: eyes on a body were drawn above it and clipped out of
        frame, so a student saw an eyeless blob and this sheet, redrawn
        after the fix, shows the eyes. The PARSE is unchanged and faithful;
        the pixels are current. Anyone reading this as "what the student
        saw" needs to know which they are looking at. */ ""}
  <p class="caveat">${recorded && !redrawn
    ? "<b>These are recordings.</b> Each drawing is the picture that was on screen when the run happened, stored with it. Later changes to the drawing code cannot alter them."
    : recorded
      ? `<b>${recorded} recorded, ${redrawn} redrawn.</b> A solid border is the picture that was actually on screen, stored with the run. A <i>dashed</i> border and a "redrawn" label mean no picture was kept for that row — it predates 5 November 2026 — so the scene was rebuilt from what the engine understood and drawn with today's code. The parse is faithful; the pixels are current.`
      : `<b>These are redrawn, not photographed.</b> Every row here predates
        5 November 2026, when runs began keeping their own picture. What the log
        stores for them is the scene the engine understood — the parts, what each
        attaches to, their colour, size and count — and this sheet draws that with
        the <i>current</i> engine. The parse is exactly what the student's words
        produced; the pixels are today's. For what was literally on screen, the
        <code>walkthrough_step</code> rows carry the engine's own description from
        that moment.`}</p>
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
