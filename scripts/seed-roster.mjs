#!/usr/bin/env node
/**
 * Put the class roster where the app needs it. Two places, one command.
 *
 *   npm run roster -- ABC12 DEF34 GHI56 ...
 *   npm run roster -- --file roster.txt        (one code per line)
 *   npm run roster -- --check                  (report, change nothing)
 *
 * THE CODES GO IN TWO PLACES AND THEY MUST MATCH.
 *
 *   1. supabase/roster.sql -> run in the SQL editor. This seeds `students`,
 *      which is what check_roster() answers from. A code that is not there
 *      is refused at sign-in as a typo.
 *
 *   2. ROSTER in src/roster.js -> shipped in the bundle. This is the
 *      ORDER the codes are dealt in, and it is what makes AlwaysNever's
 *      rule assignment balanced instead of lumpy. With it empty, assignment
 *      falls back to hashing the code: a simulated class of fourteen came
 *      out 6/5/3/3/5/6 across the six arrangements, leaving one rule barely
 *      seen in the supported condition. Dealt from this list it is
 *      5/5/4/5/5/4.
 *
 * A code seeded in one place and missing from the other fails QUIETLY --
 * the student signs in fine and is assigned by hash, or is refused at
 * sign-in on a morning nobody can debug it. Writing both from one source
 * is the point of this script.
 *
 * NO NAMES. This never asks for them and they never enter the repo. The
 * name a student types at sign-in goes on their `sessions` row and nowhere
 * else; the paper roster that maps a name to a code stays with you.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SQL_OUT = join(ROOT, "supabase", "roster.sql");
const ROSTER_JS = join(ROOT, "src", "roster.js");

const CODE_RE = /^[A-Z]{3}[0-9]{2}$/;          // ABC12 — matches normalizeCode
/* The facilitator keys, read from the module that defines them rather
   than copied. A key added there and not here would be silently dealt to
   a student, which is the collision this guards against. */
const { INSTRUCTOR_CODES } = await import("../src/roster.js");
const KEYS = new Set(INSTRUCTOR_CODES.map((k) => k.toUpperCase()));
const INSTRUCTOR = "KSS17";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const dryRun = args.includes("--dry");
const fileAt = args.indexOf("--file");

/* Staff cards: a facilitator, a spare, a second adult. Real codes that must
   work at sign-in and must NOT be students.
 *
 * Separated rather than seeded alongside, for two reasons. In the database
 * they take role 'instructor', so `where role = 'student'` is a clean cut in
 * analysis instead of a list of initials somebody has to remember. And they
 * stay out of ROSTER, because ROSTER is the order rules are DEALT in --
 * extra positions shift which student gets which rule and leave the real
 * students a lopsided subset of a balanced list. */
const staffAt = args.indexOf("--staff");
const staffRaw = staffAt >= 0
  ? args.slice(staffAt + 1).filter((a) => !a.startsWith("--"))
  : [];

/* A bare path is a file. `--file` was required at first, so the obvious
   thing to type -- `npm run roster -- roster.txt` -- came back "roster.txt:
   not code-shaped", which blames the roster for a flag the script wanted
   and never asked for. Anything that exists on disk is read as a list. */
let raw = [];
const positional = args.filter((a, i) =>
  !a.startsWith("--") && args[fileAt] !== a && !(staffAt >= 0 && i > staffAt));
const fromFile = fileAt >= 0 ? args[fileAt + 1] : positional.find((a) => existsSync(a));

if (fileAt >= 0 && (!fromFile || !existsSync(fromFile))) {
  console.error("No such file: " + fromFile);
  process.exit(2);
}
if (fromFile) {
  raw = readFileSync(fromFile, "utf8").split(/[\s,]+/);
  console.log(`Reading ${fromFile}\n`);
} else {
  raw = positional;
}

/* ---- read what is already there, so --check can say something useful --- */
const js = readFileSync(ROSTER_JS, "utf8");
const current = (js.match(/export const ROSTER = \[([\s\S]*?)\];/) || [, ""])[1]
  .split(/[",\s]+/).filter(Boolean);

if (checkOnly || !raw.length) {
  console.log(`src/roster.js holds ${current.length} code(s)` + (current.length ? ":" : "."));
  if (current.length) console.log("  " + current.join(" "));
  console.log(existsSync(SQL_OUT)
    ? `supabase/roster.sql exists — run it in the SQL editor if you have not.`
    : `supabase/roster.sql has not been written yet.`);
  if (!raw.length && !checkOnly) {
    console.log("\nTo set the roster:  npm run roster -- ABC12 DEF34 ...");
    console.log("                    npm run roster -- --file roster.txt");
  }
  process.exit(0);
}

/* ---- validate, loudly, before anything is written --------------------- */
const codes = [];
const problems = [];
const skipped = [];
const staff = [];
const staffSet = new Set(staffRaw.map((x) => x.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")));
for (const r of raw) {
  const c = r.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) continue;
  /* The instructor key belongs in the roster file -- it is a real card --
     so finding it is normal, not an error. Skipped rather than refused:
     schema.sql seeds it with role 'instructor', and re-inserting it here
     would demote it to a student and put it in the assignment deal. */
  if (c === INSTRUCTOR) { skipped.push(c); continue; }
  if (!CODE_RE.test(c)) { problems.push(`${r}: not code-shaped (want three letters then two digits, like ABC12)`); continue; }
  if (codes.includes(c) || staff.includes(c)) { problems.push(`${c}: listed twice`); continue; }
  /* A facilitator key dealt to a student would put that participant's rows
     under a facilitator and drop them from their own study. The sets have
     to be disjoint, and this is the only place a student code enters. */
  if (KEYS.has(c) && !staffSet.has(c)) {
    problems.push(`${c}: that is a facilitator key (src/roster.js). Pass it with --staff, or change the key.`);
    continue;
  }
  (staffSet.has(c) ? staff : codes).push(c);
}
for (const s of staffSet) {
  if (s !== INSTRUCTOR && !staff.includes(s)) problems.push(`${s}: marked staff but not in the roster`);
}

if (problems.length) {
  console.error("Nothing was written. Fix these first:\n");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
if (!codes.length) { console.error("No usable codes."); process.exit(1); }
if (skipped.length) console.log(`Skipped ${skipped.join(", ")} — seeded as instructor by schema.sql.
`);

/* ---- dry run: show the work before touching anything ------------------ */
if (dryRun) {
  console.log(`${codes.length} student(s), dealt rules in this order:
  ${codes.join(" ")}
`);
  if (staff.length) console.log(`${staff.length} staff, role 'instructor', not dealt:
  ${staff.join(" ")}
`);
  console.log("Would write supabase/roster.sql and ROSTER in src/roster.js.");
  console.log("Run again without --dry to do it.");
  process.exit(0);
}

/* ---- 1. the SQL ------------------------------------------------------- */
const sql = [
  /* A stamp, because an editor holding a stale buffer looked exactly like
     the database being wrong: an older generation of this file -- every
     card a student -- got run, and the role query then disagreed with what
     the repo said. A date and a count make the copy in front of you
     checkable without reading twenty lines. */
  "-- Generated by `npm run roster` on " + new Date().toISOString().slice(0, 16).replace("T", " ") + ".",
  "-- " + codes.length + " students, " + staff.length + " staff. If that does not match what you",
  "-- expect, you are looking at an old copy -- reopen supabase/roster.sql.",
  "--",
  "-- Run this in the Supabase SQL editor.",
  "--",
  "-- Idempotent: running it twice changes nothing. Adding a late student is",
  "-- the same command again with the full list, including the new code.",
  "--",
  "-- The SAME roster must be seeded in VibeBuilder's project, or the week",
  "-- stops joining on one key and a student is two people in the data.",
  "",
  "insert into students (username, role) values",
  codes.map((c) => `  ('${c}', 'student')`)
    .concat(staff.map((c) => `  ('${c}', 'instructor')`)).join(",\n"),
  "on conflict (username) do update set role = excluded.role;",
  "",
  "-- Should print " + codes.length + " student"
    + (staff.length ? " and " + (staff.length + 1) + " instructor (the staff cards plus KSS17)." : "."),
  "select role, count(*) from students group by role order by role;",
  "",
].join("\n");
writeFileSync(SQL_OUT, sql);

/* ---- 2. the ordered list in the bundle -------------------------------- */
const block = "export const ROSTER = [\n"
  + codes.map((c) => `  "${c}",`).join("\n")
  + "\n];";
const next = js.replace(/export const ROSTER = \[[\s\S]*?\];/, block);
/* Test the PATTERN, not whether the text changed. Re-running with the same
   students -- which is what happens when only a staff card moves -- is a
   no-op on this file, and reading that as "could not find ROSTER" aborted
   after roster.sql had already been rewritten. That is precisely the
   one-place-updated-and-not-the-other failure this script exists to stop,
   caused by the script itself. */
if (!/export const ROSTER = \[[\s\S]*?\];/.test(js)) {
  console.error("Could not find ROSTER in src/roster.js — not written.");
  process.exit(1);
}
writeFileSync(ROSTER_JS, next);

/* ---- what happens next ------------------------------------------------ */
console.log(`${codes.length} codes: ${codes.join(" ")}\n`);
console.log("  wrote supabase/roster.sql   -> run it in the Supabase SQL editor");
console.log("  wrote src/roster.js ROSTER  -> commit and deploy\n");
console.log("Still to do by hand:");
console.log("  - run supabase/settings.sql too, so the admin page reaches every device");
console.log("  - run the same roster.sql in VibeBuilder's Supabase project");
