/**
 * Who a row belongs to.
 *
 * There are no participant codes. Students sign in with a first name and a
 * last initial and nothing else — no card to hand out, no card to lose, no
 * code to mistype into an orphan participant nobody can account for. It also
 * matches RowdyRoboVac, which has always identified students this way, so the
 * whole week joins on one thing instead of two.
 *
 * The cost is a real one and worth saying out loud: two students in the same
 * class with the same first name and last initial are, to this database, the
 * same student. Fourteen students makes that unlikely rather than impossible.
 * Check the class list for a collision before the pilot; if there is one, the
 * fix is to have one of them use a middle initial, decided in advance and
 * written on your roster sheet.
 */
import { sha256hex } from "./lib/sha256.js";

/**
 * The grouping key written to every event.
 *
 * Events must never carry a name — that is the whole containment story for
 * identifying data on minors — but analysis still has to be able to say
 * "these forty events are one student". So events carry this: an opaque token
 * derived from the name, stable across days and devices, meaningless without
 * the sessions table that maps it back.
 *
 * It is not a secret. Anyone holding the class list can recompute it. It is a
 * pseudonym, which is all it needs to be: the name itself lives on exactly
 * one row, and this is what travels.
 */
export function pseudonym(first, initial) {
  const norm = `${String(first).trim().toLowerCase()}|${String(initial).trim().toLowerCase()}`;
  return sha256hex("ctx3-pseudonym:" + norm).slice(0, 10).toUpperCase();
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
