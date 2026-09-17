#!/usr/bin/env node
/**
 * rescore.mjs — recompute every derived field from a raw event log.
 *
 *   node scripts/rescore.mjs <log.json> [--csv out.csv] [--check]
 *
 * <log.json> is either the hidden JSON export from a device
 * ({participantCode, events:[...]}), an array of event rows, or a Supabase
 * dump of the events table. All three shapes are accepted.
 *
 * Why this exists: the step sequences in scoring.mjs are a guess until the
 * pilot produces data. If every derived field can be recomputed from raw
 * events, revising a sequence afterwards costs a table edit and one command
 * instead of invalidating the dataset. That is what makes the ordinal
 * sequences a non-blocking decision.
 *
 * --check re-derives the fields the tools stored at emit time and reports
 * disagreements. Live and rescored run the same code, so any disagreement is
 * a real bug (a tool that failed to capture a raw input, usually) rather than
 * drift to be shrugged at.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { replay, developmentalRange, STEP_TABLE, SCORING_VERSION } from "./scoring.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const csvOut = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : null;
const check = args.includes("--check");

if (!file) {
  console.error("usage: node scripts/rescore.mjs <log.json> [--csv out.csv] [--check]");
  process.exit(2);
}

/* ---- accept the three shapes a log arrives in ---- */
const raw = JSON.parse(readFileSync(file, "utf8"));
let events = Array.isArray(raw) ? raw : raw.events ?? raw.rows ?? [];
if (!Array.isArray(events)) { console.error("no events array found in " + file); process.exit(2); }
// Supabase rows nest the payload and name columns differently
events = events.map((e, i) => ({
  seq: e.seq ?? i + 1,
  ts: e.ts ?? e.client_ts ?? e.clientTs ?? null,
  tool: e.tool ?? e.payload?.tool ?? null,
  type: e.type,
  participantCode: e.participantCode ?? e.payload?.participantCode ?? null,
  payload: e.payload ?? e,
}));

const { attempts: rows, phases } = replay(events);
const ranges = developmentalRange(phases);

/* ---- report ---- */
const bold = (s) => "\x1b[1m" + s + "\x1b[0m";
console.log(bold("\nrescore.mjs") + `  scoringVersion ${SCORING_VERSION}`);
console.log(`${events.length} events → ${rows.length} scored attempts\n`);

const byTool = {};
for (const r of rows) (byTool[r.tool] ||= []).push(r);
for (const [tool, rs] of Object.entries(byTool)) {
  const defs = STEP_TABLE[tool] || [];
  if (!defs.length) { console.log(bold(tool) + "  no step sequence (whole-class)\n"); continue; }
  const ph = phases.filter((f) => f.tool === tool);
  console.log(bold(tool) + `  ${ph.length} phase(s)`);
  for (const d of defs) {
    const n = ph.filter((f) => f.stepsSatisfied.includes(d.step)).length;
    const bar = "█".repeat(Math.round((n / Math.max(1, ph.length)) * 24));
    console.log(`  ${d.step}. ${d.label.slice(0, 52).padEnd(54)} ${String(n).padStart(3)}/${ph.length} ${bar}`);
  }
  /* Guttman is checked on the PHASE's satisfied set: a set that is not a
     prefix means a later step was reached while an earlier one never was. */
  const broken = ph.filter((f) => !f.guttmanClean);
  const coeff = ph.length ? 1 - broken.length / ph.length : 1;
  console.log(`  scalability (prefix-clean phases): ${coeff.toFixed(2)}` +
    (broken.length ? `  — ${broken.length} phase(s) reached a later step while never reaching an earlier one` : ""));
  if (broken.length) {
    const ex = broken.slice(0, 3).map((f) => `[${f.stepsSatisfied.join(",")}]`).join(" ");
    console.log(`  e.g. ${ex}  — if this is common the sequence needs reordering (DEVELOPMENTAL-RANGE.md)`);
  }
  const inexact = ph.filter((f) => !f.stepScoringExact).length;
  if (inexact) console.log(`  ${inexact} phase(s) flagged stepScoringExact:false — hand-code these`);
  console.log("");
}

console.log(bold("phases"));
for (const f of phases) {
  console.log(`  ${(f.participantCode || "?").padEnd(8)} ${f.tool.padEnd(15)} ${String(f.phaseId).padEnd(12)} ` +
    `${f.supportCondition.padEnd(5)} steps [${f.stepsSatisfied.join(",")}] → ${bold(String(f.highestStepReached))}` +
    `  scaffolds: ${f.scaffoldsActive.length ? f.scaffoldsActive.join("+") : "none"}`);
}
console.log("");

console.log(bold("developmental range") + "  highestStep(high) − highestStep(low)");
if (!ranges.length) console.log("  nothing to report");
for (const r of ranges) {
  console.log(`  ${(r.participantCode || "?").padEnd(8)} ${r.tool.padEnd(16)} ` +
    `high ${r.high ?? "–"}  low ${r.low ?? "–"}  ` +
    (r.developmentalRange == null ? `— ${r.note}` : bold("range " + r.developmentalRange)));
}

if (check) {
  console.log(bold("\n--check") + "  stored-at-emit vs recomputed");
  let bad = 0;
  for (const ev of events) {
    if (ev.type !== "attempt_submitted") continue;
    const mine = rows.find((r) => r.attemptId === ev.payload.attemptId);
    if (!mine) continue;
    for (const f of ["editDistanceFromPrevious", "consecutiveFailures"]) {
      const stored = ev.payload[f];
      if (stored !== undefined && stored !== null && stored !== mine[f]) {
        console.log(`  seq ${ev.seq} ${f}: stored ${stored}, recomputed ${mine[f]}`); bad++;
      }
    }
  }
  console.log(bad ? `  ${bad} disagreement(s) — a tool is not capturing a raw input` : "  clean");
}

if (csvOut) {
  const cols = ["participantCode","tool","taskId","attemptId","phaseId","supportCondition","stepReached","stepsSatisfied",
    "stepScoringExact","editDistanceFromPrevious","msFromFailureToNextAttempt","consecutiveFailures","scoringVersion"];
  const csv = [cols.join(",")].concat(rows.map((r) => cols.map((c) => {
    const v = Array.isArray(r[c]) ? r[c].join(" ") : r[c];
    return v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  }).join(","))).join("\n");
  writeFileSync(csvOut, csv);
  console.log(`\nwrote ${csvOut}  (${rows.length} rows)`);
}
console.log("");
