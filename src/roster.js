/**
 * Who a row belongs to.
 *
 * Students sign in with a participant code printed on a card — ABC12, three
 * letters and two digits — plus their first name and last initial. The code
 * is the key; the name is there so a teacher can match a device to a paper
 * packet.
 *
 * THIS FILE USED TO ARGUE THE OPPOSITE, and the reversal is deliberate.
 *
 * The case against codes was: no card to hand out, no card to lose, no code to
 * mistype into an orphan participant nobody can account for, and names matched
 * RowdyRoboVac so the week joined on one thing instead of two. Two of those
 * premises changed. Students now carry a card for VibeBuilder regardless, so
 * the card cost is paid whether or not this tool uses one; and the roster is
 * pre-seeded in the database, so a mistyped code is refused at sign-in instead
 * of becoming an orphan. RowdyRoboVac now collects the same code.
 *
 * What the switch buys is the collision the old comment called unlikely rather
 * than impossible: two students with the same first name and last initial were
 * one student to a name-derived pseudonym. They are two students to a code.
 *
 * The cost is the one the old comment named and it is real: a student who
 * loses their card cannot sign in as themselves. The paper roster is the
 * backup, and it lives with the facilitator, not in this repo.
 */

/** Codes are ABC12: three letters, then two digits. */
const CODE_RE = /^[A-Z]{3}[0-9]{2}$/;

/**
 * The facilitator keys.
 *
 * There are seven, and they open every tool in the week — this one,
 * VibeBuilder and RowdyRoboVac — so a facilitator can demo, test a station or
 * walk a student through something without borrowing a card. Each facilitator
 * has their own rather than sharing one: whose demo produced which row is
 * worth knowing, and a key that can be revoked alone is worth having.
 *
 * They cluster on purpose. KSS03/11/17/18 are one person's and SAM12/14/16
 * another's, so a facilitator mistyping their own key lands on another of
 * their own rather than in a participant's project. That is only safe while no
 * PARTICIPANT code sits within one keystroke of any of them — true of the
 * fourteen printed for this cohort, and worth re-checking before adding more.
 *
 * They are the same SHAPE as a participant code, and NOTHING ABOUT THE
 * DIGITS KEEPS THEM APART. This comment used to say the generator never
 * emits 0 or 1 — so that every key, all of which contain one, was safe by
 * construction. That is not true of this cohort: CGU11, AWC18 and IEZ40 are
 * participant codes and they carry a 0 or a 1. Believing it would let
 * someone add a key that collides with a real student, and a collision
 * means a participant's rows land under a facilitator and are excluded from
 * their own study.
 *
 * What actually keeps them apart is that the sets are disjoint and it is
 * CHECKED: `npm run roster` refuses a roster containing any of these keys.
 * Add a key here and re-run it.
 *
 * Their rows are real rows — the tools log a facilitator session exactly like
 * a student's. `scripts/seed-roster.mjs` gives them role 'instructor', so the
 * clean cut in analysis is:
 *
 *   where role = 'student'
 */
export const INSTRUCTOR_CODES = [
  "KSS03", "KSS11", "KSS17", "KSS18",
  "SAM12", "SAM14", "SAM16",
];

/** The one named in documentation; the checks below use the whole set. */
export const INSTRUCTOR_CODE = "KSS17";

export const isInstructor = (code) =>
  INSTRUCTOR_CODES.includes(String(code ?? "").trim().toUpperCase());

/**
 * What the student typed, as a code — or null if it could never be one.
 *
 * Cards get read by 11-14 year olds, so lowercase, spaces and stray dashes are
 * all forgiven. Anything still not code-shaped is rejected here, before the
 * roster is asked, because a malformed code is a typo every time and there is
 * no point spending a network round trip to find that out.
 */
export function normalizeCode(raw) {
  const cleaned = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (isInstructor(cleaned)) return cleaned;
  return CODE_RE.test(cleaned) ? cleaned : null;
}

/**
 * The grade these participants are in.
 *
 * `sessions.grade` is NOT NULL in the shared study database — RowdyRoboVac
 * collects it per student and the column predates CTx3. A single-grade pilot
 * does not need to ask fourteen 8th graders what grade they are in, so it is
 * a constant here. If a cohort ever spans grades this becomes a sign-in field
 * rather than a constant.
 */
export const GRADE = "8";

/**
 * The class list, in any fixed order, as participant codes: ["ABC12", ...].
 *
 * Optional, and everything works with it empty. What it buys is BALANCED
 * ASSIGNMENT. AlwaysNever's never tier has three instructions and therefore
 * six ways to arrange a supported/unsupported pair, and with no roster the
 * arrangement is drawn from a hash of the student's code. A hash gives
 * independent draws, not balance: a simulated class of fourteen came out
 * 6/5/3/3/5/6 across the six arrangements, which leaves one instruction
 * barely seen in the supported condition.
 *
 * With the list filled, assignment is dealt round-robin from each student's
 * position instead, so fourteen students land 3/3/2/2/2/2 and every
 * instruction is seen in both conditions a comparable number of times.
 *
 * Paste the codes from the roster you seeded into the database — the order
 * only has to be fixed, not meaningful.
 */
export const ROSTER = [
  "SFR99",
  "CGU11",
  "IGW93",
  "ZJA69",
  "AWC18",
  "GRB32",
  "TVK34",
  "FSL32",
  "LCY62",
  "IEZ40",
  "YMR58",
  "KAN66",
  "CBE47",
  "QCT22",
];

/**
 * Where this student sits in the roster, or -1 when there is no list, or the
 * code is not on it (a late add, a spare card). -1 falls back to the hash, so
 * an unlisted student still gets a valid assignment rather than an error.
 */
export function rosterIndex(code) {
  if (!ROSTER.length) return -1;
  const want = String(code ?? "").trim().toUpperCase();
  return ROSTER.findIndex((c) => String(c).trim().toUpperCase() === want);
}
