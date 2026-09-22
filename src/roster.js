/**
 * Who a row belongs to.
 *
 * Students sign in with a participant code printed on a card — ABC123, three
 * letters and three digits — plus their first name and last initial. The code
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

/** Codes are ABC123: three letters, then three digits. */
const CODE_RE = /^[A-Z]{3}[0-9]{3}$/;

/**
 * The instructor's key.
 *
 * KSS17 opens every tool in the week — this one, VibeBuilder and
 * RowdyRoboVac — so a facilitator can demo, test a station or walk a student
 * through something without borrowing a card.
 *
 * It is deliberately a DIFFERENT SHAPE from a student code: three letters and
 * two digits, where students get three and three. That means it can never
 * collide with a generated card, and instructor rows are recognisable at a
 * glance in a data dump.
 *
 * Its rows are real rows — the tools log an instructor session exactly like a
 * student's. Exclude them in analysis rather than assuming they are not there:
 *
 *   where participant_code <> 'KSS17'
 */
export const INSTRUCTOR_CODE = "KSS17";

export const isInstructor = (code) =>
  String(code ?? "").trim().toUpperCase() === INSTRUCTOR_CODE;

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
  if (cleaned === INSTRUCTOR_CODE) return cleaned;
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
 * The class list, in any fixed order, as participant codes: ["ABC123", ...].
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
export const ROSTER = [];

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
