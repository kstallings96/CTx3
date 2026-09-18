/**
 * The participant roster.
 *
 * Codes are three letters then two digits, avoiding characters that get
 * misread off a printed card: no O, I or S, no 0, 1 or 5. A code that is not
 * on this list gets a gentle retry rather than proceeding, because a typo'd
 * code silently creates an orphan participant you only discover at analysis.
 *
 * Replace these with the real class list before the pilot. The mapping from
 * code to student lives on paper with the research team and never in this repo.
 */
export const ROSTER = [
  "KTQ47", "BXM82", "RHD36", "VNJ94", "TCW28", "GPL73", "FZB69", "MDR42",
  "JHN63", "PWR29", "XCB74", "DTM38", "VQF62", "HKZ93",
];

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
