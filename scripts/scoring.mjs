/**
 * scoring.mjs — the single source of truth for step scoring.
 *
 * Canonical. The demo HTML inlines a verbatim copy of STEP_TABLE, scoreAttempt
 * and replay; scripts/rescore.mjs imports this file directly. In the real repo
 * these are src/shared/steps.ts + scoring.ts + replay.ts and there is no copy.
 *
 * Three rules this file exists to enforce:
 *   1. Step definitions are DATA (STEP_TABLE), never scattered tool logic.
 *      Revising a sequence after the pilot is a table edit.
 *   2. scoreAttempt is PURE — no DOM, no clock, no tool state. Unit-testable.
 *   3. replay() rebuilds derived fields from raw events ALONE, so the live
 *      path and the rescore path run identical code and can be compared.
 */

export const SCORING_VERSION = "2026-09-16.1";

/* ------------------------------------------------------------------ helpers */
export const words = (s) => (s || "").trim() ? s.trim().split(/\s+/).length : 0;

export function levenshtein(a, b) {
  a = (a || "").slice(0, 400); b = (b || "").slice(0, 400);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Content words shared between two prompts — the cheap proxy for "reused a
 *  structural element". Deliberately crude and deliberately visible here. */
const STOP = new Set(["a","an","the","of","in","on","to","for","and","or","it","that","this","with","me","my","i","you","your","is","are","be","please","give","make","write","some","each","one"]);
export function contentWords(s) {
  return new Set((s || "").toLowerCase().match(/[a-z][a-z-]*/g)?.filter((w) => !STOP.has(w)) ?? []);
}
export function sharedStructure(a, b) {
  const A = contentWords(a), B = contentWords(b);
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n;
}

/* --------------------------------------------------------------- step table */
/**
 * One entry per tool. Each step is {step, id, label, needs, test}.
 *   needs — raw fields the test consumes. Documentation AND a checklist for
 *           "are we capturing enough to rescore this later".
 *   test  — (ctx) => boolean. ctx is built by replay() from raw events only.
 *   exact — false when the step cannot be scored mechanically in this context
 *           (free-text conditions); surfaces as stepScoringExact: false.
 */
export const STEP_TABLE = {
  "prompt-golf": [
    { step: 1, id: "passes", label: "Produces any prompt that passes the target",
      needs: ["pass"],
      test: (c) => c.pass === true },
    { step: 2, id: "shortens", label: "Reduces word count on a later attempt for the same target",
      needs: ["wordCount", "taskId", "pass"],
      test: (c) => c.pass === true && c.priorPassWordCount != null && c.wordCount < c.priorPassWordCount },
    { step: 3, id: "reuses", label: "Reuses a structural element from an earlier winning prompt on a new target",
      needs: ["artifact", "taskId"],
      test: (c) => c.pass === true && c.priorWinnerOtherTask != null && sharedStructure(c.artifact, c.priorWinnerOtherTask) >= 2 },
    { step: 4, id: "names", label: "Names a structural commonality between two winning prompts",
      needs: ["comparisonResponse", "comparisonCode"],
      test: (c) => c.comparisonCode === "S" },
    { step: 5, id: "transfers", label: "Applies the named structure to a novel target unaided (low support)",
      needs: ["supportCondition", "pass", "artifact"],
      test: (c) => c.supportCondition === "low" && c.pass === true },
  ],
  "find-the-rule": [
    { step: 1, id: "probes", label: "Sends probes",
      needs: ["probeIndex"],
      test: (c) => c.probeIndex != null },
    { step: 2, id: "single-feature", label: "Varies exactly one feature from the previous probe",
      needs: ["slotValues", "probeIndex"],
      test: (c) => c.singleFeatureVariation === true,
      exact: (c) => c.slotValues != null },
    { step: 3, id: "states-hypothesis", label: "States a hypothesis before committing",
      needs: ["hypothesisAtCommit", "hypothesisBeforeCommit"],
      test: (c) => c.statedHypothesisBeforeTest === true },
    { step: 4, id: "disconfirms", label: "Sends a probe that could disconfirm the stated hypothesis",
      needs: ["slotValues", "hypothesisHistory", "probeIndex"],
      test: (c) => c.disconfirmingProbe === true,
      exact: (c) => c.slotValues != null },
    { step: 5, id: "predicts", label: "Commits a rule that correctly predicts held-out cases",
      needs: ["committedRule", "casesMatched"],
      test: (c) => c.casesMatched === true },
  ],
  /* Two Machines is whole-class. No step sequence, supportCondition na. */
  "two-machines": [],
};

/* ----------------------------------------------------------------- scoring */
/**
 * Pure. What did THIS attempt satisfy?
 *
 * Note the unit carefully. An individual attempt cannot satisfy "reduces word
 * count on a LATER attempt" and "names a commonality" at the same moment —
 * those are different events in time. So an attempt reports its CONTRIBUTIONS,
 * and the ordinal high-water mark is accumulated over the phase. That matches
 * EVENTS.md, where `highestStepReached` sits on `phase_complete`, and it is
 * also how Lamborn scored: did the subject EVER demonstrate step N under this
 * condition, not does this one trial show it.
 */
export function scoreAttempt(tool, ctx) {
  const defs = STEP_TABLE[tool] || [];
  const satisfied = [];
  let exact = true;
  for (const d of defs) {
    let ok = false;
    try { ok = !!d.test(ctx); } catch { ok = false; }
    if (ok) {
      satisfied.push(d.step);
      if (typeof d.exact === "function" && !d.exact(ctx)) exact = false;
    }
  }
  return { stepsSatisfied: satisfied, stepScoringExact: exact, scoringVersion: SCORING_VERSION };
}

/** Highest CONSECUTIVE step in a satisfied set — the Guttman high-water mark. */
export function highestConsecutive(satisfiedSet) {
  let h = 0;
  while (satisfiedSet.has(h + 1)) h++;
  return h;
}

/* ------------------------------------------------------------------ replay */
/**
 * Rebuild every derived field from raw events alone.
 * Live tools call this incrementally; scripts/rescore.mjs calls it over an
 * exported log. Same code both ways, on purpose.
 *
 * Returns { attempts, phases }. Steps accumulate per PHASE; each attempt row
 * carries the running high-water mark at that moment plus its own contribution.
 */
export function replay(events) {
  const byTask = {};
  const winners = {};
  const hypo = [];
  const attempts = [];
  const phases = [];
  let comparisonResponse = null, comparisonCode = null;
  let phase = null;

  const sorted = [...events].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const openPhase = (tool, participantCode, p) => {
    phase = { key: (participantCode || "?") + "|" + tool + "|" + (p.phaseId || "default"),
      phaseId: p.phaseId || "default", tool, participantCode,
      supportCondition: p.supportCondition || "na", scaffoldsActive: p.scaffoldsActive || [],
      satisfied: new Set(), exact: true, attempts: 0 };
    phases.push(phase);
    return phase;
  };

  for (const ev of sorted) {
    const p = ev.payload || {};
    const tool = ev.tool || p.tool;
    const pc = p.participantCode ?? ev.participantCode ?? null;

    if (ev.type === "phase_start") {
      openPhase(tool, pc, p);
      // Scaffolded facts do not cross a phase boundary. The comparison answer
      // is produced under high support; letting it count toward the low phase
      // would credit the unsupported condition with supported work.
      comparisonResponse = null; comparisonCode = null;
    }
    if (ev.type === "comparison_response") { comparisonResponse = p.text; comparisonCode = p.code ?? null; }
    if (ev.type === "hypothesis_noted") hypo.push({ text: p.text, afterProbeIndex: p.afterProbeIndex, seq: ev.seq, stage: p.stage || "field" });

    if (ev.type !== "attempt_submitted") continue;
    if (!phase || phase.tool !== tool) phase = openPhase(tool, pc, { phaseId: p.phaseId, supportCondition: p.supportCondition, scaffoldsActive: [] });

    const taskId = p.taskId || "unknown";
    const st = byTask[taskId] || (byTask[taskId] = { lastArtifact: null, lastFailAt: null, consecutiveFailures: 0, bestPassWords: null });

    const evaluated = sorted.find((e) => e.type === "attempt_evaluated" && (e.payload || {}).attemptId === p.attemptId);
    const pass = evaluated ? (evaluated.payload.outcome === "pass") : null;
    const otherWinner = Object.entries(winners).find(([k]) => k !== taskId);

    const ctx = {
      tool, taskId, attemptId: p.attemptId, artifact: p.artifact,
      wordCount: p.wordCount ?? words(p.artifact), pass,
      supportCondition: p.supportCondition || phase.supportCondition,
      scaffoldsActive: phase.scaffoldsActive,
      priorPassWordCount: st.bestPassWords,
      priorWinnerOtherTask: otherWinner ? otherWinner[1] : null,
      comparisonResponse, comparisonCode,
      probeIndex: p.probeIndex ?? null,
      slotValues: p.slotValues ?? null,
      singleFeatureVariation: p.singleFeatureVariation ?? null,
      disconfirmingProbe: p.disconfirmingProbe ?? null,
      statedHypothesisBeforeTest: p.statedHypothesisBeforeTest ?? (hypo.length > 0),
      casesMatched: p.casesMatched ?? null,
      hypothesisHistory: hypo.map((h) => h.text),
    };

    const derived = {
      editDistanceFromPrevious: st.lastArtifact == null ? null : levenshtein(st.lastArtifact, p.artifact),
      msFromFailureToNextAttempt: st.lastFailAt != null && ev.ts ? Date.parse(ev.ts) - st.lastFailAt : (p.msFromFailureToNextAttempt ?? null),
      consecutiveFailures: st.consecutiveFailures,
      msSinceLastAttempt: p.msSinceLastAttempt ?? null,
    };
    const sc = scoreAttempt(tool, ctx);
    for (const n of sc.stepsSatisfied) phase.satisfied.add(n);
    if (!sc.stepScoringExact) phase.exact = false;
    phase.attempts++;

    attempts.push({ seq: ev.seq, participantCode: pc, tool, taskId, attemptId: p.attemptId,
      phaseId: phase.phaseId, supportCondition: ctx.supportCondition,
      ...derived, stepsSatisfied: sc.stepsSatisfied,
      stepReached: highestConsecutive(phase.satisfied),   // running high-water within the phase
      stepScoringExact: sc.stepScoringExact, scoringVersion: sc.scoringVersion });

    st.lastArtifact = p.artifact;
    if (pass === true) { st.consecutiveFailures = 0; st.lastFailAt = null;
      if (st.bestPassWords == null || ctx.wordCount < st.bestPassWords) st.bestPassWords = ctx.wordCount;
      winners[taskId] = p.artifact; }
    else if (pass === false) { st.consecutiveFailures++; st.lastFailAt = ev.ts ? Date.parse(ev.ts) : null; }
  }

  const phaseRows = phases.filter((f) => f.attempts).map((f) => {
    const set = f.satisfied, h = highestConsecutive(set);
    return { participantCode: f.participantCode, tool: f.tool, phaseId: f.phaseId,
      supportCondition: f.supportCondition, scaffoldsActive: f.scaffoldsActive,
      attempts: f.attempts, stepsSatisfied: [...set].sort((a, b) => a - b),
      highestStepReached: h, guttmanClean: set.size === h, stepScoringExact: f.exact,
      scoringVersion: SCORING_VERSION };
  });
  return { attempts, phases: phaseRows };
}

/** developmentalRange = highestStep(high) − highestStep(low), per student per tool. */
export function developmentalRange(phaseRows) {
  const by = {};
  for (const r of phaseRows) {
    const k = (r.participantCode || "?") + "|" + r.tool;
    const b = by[k] || (by[k] = { participantCode: r.participantCode, tool: r.tool, high: null, low: null });
    if (r.supportCondition === "high") b.high = Math.max(b.high ?? 0, r.highestStepReached);
    if (r.supportCondition === "low") b.low = Math.max(b.low ?? 0, r.highestStepReached);
  }
  return Object.values(by).map((b) => ({ ...b,
    developmentalRange: (b.high != null && b.low != null) ? b.high - b.low : null,
    note: b.low == null ? "no low-support phase for this tool" : null }));
}
