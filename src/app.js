import { log, flushNow, bufferedCount, exportJSON, clearBuffer, startSession, hasBackend } from "./lib/events.js";
import { askModel, modelAvailable } from "./lib/model.js";
import { ROSTER } from "./roster.js";

/* ============================ shared ============================ */
const LS = "d3station.v2";
const S = { code: "", day: 3, screen: "hub", tool: "hub", events: [], seq: 0,
  support: "na", phaseId: null, phaseScaffolds: [],
  forceOffline: false, brandTaps: 0, lastAttempt: null, deviceId: "dev-" + Math.random().toString(36).slice(2, 8) };
const nowISO = () => new Date().toISOString();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const words = (s) => (s || "").trim() ? s.trim().split(/\s+/).length : 0;
const SPINE = new Set(["session_start","task_start","attempt_submitted","attempt_evaluated","attempt_abandoned",
  "support_used","comparison_shown","comparison_response","task_complete","session_end"]);

/* Every event carries participantCode and supportCondition. Not optional and
   not per-tool — DEVELOPMENTAL-RANGE.md's whole framework depends on being
   able to split any analysis by condition. */
function emit(type, payload = {}) {
  const ev = { seq: ++S.seq, ts: nowISO(), tool: S.tool, type,
    payload: { participantCode: S.code, supportCondition: S.support, ...payload } };
  S.events.push(ev); save(); renderRail();
  // Mirrors to localStorage immediately and flushes in batches; the UI never
  // waits on the network. See src/lib/events.js.
  log(ev);
  return ev;
}
/* phase_start records what was ON, not just the condition label: the label is
   an interpretation, the list is a fact. */
function phaseStart(phaseId, supportCondition, scaffoldsActive) {
  S.support = supportCondition; S.phaseId = phaseId; S.phaseScaffolds = scaffoldsActive;
  emit("phase_start", { phaseId, supportCondition, scaffoldsActive });
}
function phaseComplete(highestStepReached) {
  if (!S.phaseId) return;
  emit("phase_complete", { phaseId: S.phaseId, highestStepReached });
  S.phaseId = null;
}
function save() { try { localStorage.setItem(LS, JSON.stringify({ code: S.code, day: S.day, seq: S.seq, events: S.events.slice(-400) })); } catch (e) {} }
function load() {
  try { const d = JSON.parse(localStorage.getItem(LS) || "null"); if (!d) return;
    if (d.code) S.code = d.code; if (d.day) S.day = d.day;
    if (Array.isArray(d.events)) { S.events = d.events; S.seq = d.seq || d.events.length; }
  } catch (e) {}
}
function renderRail() {
  $("stream").innerHTML = S.events.slice(-70).map((e) => {
    let cls = SPINE.has(e.type) ? "spine" : "";
    const p = e.payload || {};
    if (p.failureType === "nondeterministic_variance" || e.type === "rule_violation_caught") cls = "warn";
    else if (p.outcome === "pass" || p.match === true || p.pass === true) cls = "good";
    else if (p.outcome === "fail" || p.match === false || p.pass === false) cls = "bad";
    const body = Object.entries(p).map(([k, v]) => {
      let s = typeof v === "string" ? v : JSON.stringify(v);
      if (s && s.length > 54) s = s.slice(0, 52) + "…";
      return `${k}: ${esc(s)}`;
    }).join("  ·  ");
    return `<div class="ev ${cls}"><div class="t"><span>${e.type}</span><i>${String(e.seq).padStart(3,"0")} · ${e.ts.slice(11,19)}</i></div>${body ? `<div class="p">${body}</div>` : ""}</div>`;
  }).join("");
  const pending = bufferedCount();
  $("evcount").textContent = S.events.length + (S.events.length === 1 ? " event" : " events")
    + (pending ? " \u00b7 " + pending + (hasBackend ? " queued" : " held") : "");
  $("derived").innerHTML = S.lastAttempt
    ? Object.entries(S.lastAttempt).map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(String(v))}</span>`).join("")
    : `<span class="k">no attempt yet</span><span class="v">—</span>`;
}
function lev(a, b) {
  a = (a || "").slice(0, 220); b = (b || "").slice(0, 220);
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev]; }
  return prev[n];
}
function diffRange(a, b) {
  let s = 0; const la = a.length, lb = b.length;
  while (s < la && s < lb && a[s] === b[s]) s++;
  let ea = la, eb = lb; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return [s, Math.max(eb, s + 1)];
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
function rng(seed) { let x = seed >>> 0 || 7; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

const track = { lastArtifact: {}, lastFailAt: {}, consec: {}, outcomeByHash: {} };
function attemptDerived(taskId, artifact, extra = {}) {
  const prev = track.lastArtifact[taskId];
  const d = { editDistanceFromPrevious: prev == null ? null : lev(prev, artifact),
    msFromFailureToNextAttempt: track.lastFailAt[taskId] ? Date.now() - track.lastFailAt[taskId] : null,
    consecutiveFailures: track.consec[taskId] || 0, ...extra };
  track.lastArtifact[taskId] = artifact; S.lastAttempt = { task: taskId, ...d }; return d;
}
function evaluate(taskId, attemptId, pass, artifact, checkerOutput) {
  const h = hash(artifact).toString(36), before = track.outcomeByHash[h];
  const outcome = pass ? "pass" : "fail";
  let failureType = null;
  if (!pass) failureType = before === "pass" ? "nondeterministic_variance" : "target_not_met";
  else if (before === "fail") failureType = "nondeterministic_variance";
  track.outcomeByHash[h] = outcome;
  if (pass) { track.consec[taskId] = 0; track.lastFailAt[taskId] = null; }
  else { track.consec[taskId] = (track.consec[taskId] || 0) + 1; track.lastFailAt[taskId] = Date.now(); }
  emit("attempt_evaluated", { attemptId, outcome, failureType, artifactHash: h, ...(checkerOutput ? { checkerOutput } : {}) });
  return failureType;
}

/* ============================ the model layer ============================ */
const LLM = { ok: false, state: "checking", lastError: null };
const liveOn = () => LLM.ok && !S.forceOffline;

/* One call to our own /api/complete, which holds the key server-side. The
   client never sees it. Caching is off at the edge: a repeat really is a
   repeat, which is the whole point of Day 3. */
async function ask(prompt, opts = {}) {
  if (!liveOn()) return null;
  try {
    const text = await askModel(prompt, opts.signal);
    return (text || "").trim() || null;
  } catch (e) {
    LLM.lastError = e && e.code ? e.code : "upstream_error";
    if (LLM.lastError === "not_configured") { LLM.ok = false; LLM.state = "off"; paintMode(); }
    if (LLM.lastError === "cancelled") throw e;
    return null;
  }
}
function paintMode() {
  const pill = $("modepill"), txt = $("modetext"), note = $("modenote");
  if (!pill) return;
  const live = liveOn();
  pill.className = "mode" + (live ? " live" : "");
  txt.textContent = LLM.state === "checking" ? "checking\u2026" : live ? "live model" : "offline stand-in";
  note.innerHTML = LLM.state === "checking" ? "Looking for the model\u2026"
    : LLM.ok ? (S.forceOffline
        ? "Forced to the deterministic stand-in so you can show the same activity with the randomness removed. Flip it back to demo variance."
        : "Calls go through this site's own endpoint with caching <b>off</b>, so sending the same thing twice really does ask twice. That is the point of the day and it is why caching is disabled.")
    : "No model reachable" + (LLM.lastError ? " (<span class=\"kbd\">" + esc(LLM.lastError) + "</span>)" : "")
      + ". Everything still runs on deterministic stand-ins \u2014 the activities work, but nothing varies.";
}
(async () => {
  LLM.ok = await modelAvailable();
  LLM.state = LLM.ok ? "on" : "off";
  paintMode();
  emit("model_availability", { live: LLM.ok, caching: false });
  if (S.screen === "tm" || S.screen === "pg") go(S.screen);
})();

/* ============================ rules registry ============================ */
const COLOURS = ["red","blue","green","yellow","orange","purple","pink","brown","grey","gray","black","white","silver","gold"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const has = (t, list) => list.some((w) => new RegExp("\\b" + w + "s?\\b", "i").test(t));

/* The four rules EVERY student gets, in this order. Fixed, never assigned —
   comparing probe counts across students depends on everyone facing the same puzzle. */
const RULES = {
  no_e: { level: 1, name: "Level 1", tierWord: "lexical", label: "never uses the letter E",
    check: (t) => !/e/i.test(t), predicts: "the reply contains no letter E",
    judge: /\b(no|never|avoid|avoids|without|skip|skips|missing|drops?|doesn'?t use|does not use|leaves out)\b[^.!?]{0,28}\b(letter\s+)?e\b/i,
    look: "Read its answers very closely. The same thing is true about <b>every single one</b>.",
    hints: ["Ask about two totally different things and put the answers side by side. It is not about what they mean.",
            "It is about how the answers are spelled — which letters are allowed to show up.",
            "Think of the most common letter in English, then go looking for it."],
    say: {
      "in a few words": [(x) => x + ", obviously.", (x) => x + ", hands down.", (x) => x + ", all day long.", (x) => "Simply " + x + "."],
      "in one sentence": [(x) => x + ", and it is not a hard call at all.",
        (x) => x + ", and I would not pick anything but that.",
        (x) => x + ", and that is all I want to say about it.",
        (x) => "I am going with " + x + ", and I am not sorry about it."],
      "in a paragraph": [(x) => x + ", and it is not a hard call at all. Not on my top four? Try it again and think a bit. I stand by this and always will.",
        (x) => x + ", and I would not pick anything but that. My pals all say I am wrong. My pals do not know what is good. I stand by all of that.",
        (x) => x + ", all day long. And if you do not think so, that is on you, not on my list. I will not back down."] } },

  one_number: { level: 2, name: "Level 2", tierWord: "categorical", label: "always includes exactly one number",
    check: (t) => (t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi) || []).length === 1,
    predicts: "the reply contains exactly one number",
    judge: /\b(one|a single|exactly one|1)\b[^.!?]{0,26}\bnumbers?\b|\bnumbers?\b[^.!?]{0,26}\b(always|every|each|one|single)\b/i,
    look: "Its answers are about whatever you asked — but something else <b>keeps turning up</b>. Line a few up next to each other.",
    hints: ["Ask about things that have nothing to do with counting.",
            "Something shows up in every answer that you never asked for.",
            "Count how many numbers are in each answer. It is the same count every single time."],
    say: {
      "in a few words": [(x) => x + " — a solid 10.", (x) => x + ", and that is my number 1.",
        (x) => x + ", 100%.", (x) => "Easy. " + x + ", every 7 days of the week."],
      "in one sentence": [(x) => x + ", and I would give it a 9 without thinking about it.",
        (x) => x + ", and I have felt that way for about 3 years now.",
        (x) => x + ", which beats everything imaginable by a factor of 12.",
        (x) => "Honestly? " + x + ", and I have said so since I was 6."],
      "in a paragraph": [(x) => x + ", easily. I would give it a 9 and argue with anybody who disagrees. Nothing comes close.",
        (x) => x + ", and I have thought so since I was 7. Everything else is a distant second. Do not even bother arguing.",
        (x) => "It is " + x + ". I have tried all the others and this is the only 1 worth defending. Everything else is noise."] } },

  /* BANKED for spring — conditional tier is a ceiling item (Fischer places
     abstract mappings at 14-16). Not in the pilot four. */
  one_behind: { level: 3, name: "banked", banked: true, tierWord: "conditional", label: "answers the question you asked BEFORE this one", conversational: true,
    check: () => true, predicts: "it answers your previous question, not this one",
    judge: /\b(before|previous|previously|last|earlier|behind|delay\w*|lag\w*|prior|one back|late)\b/i,
    look: "It answers every question happily. Check <b>which</b> question it is answering.",
    hints: ["Ask about two completely different things in a row, then read the second answer carefully.",
            "The answer you get is not about the question you just asked.",
            "It is always one question behind — you get the answer to the one before."],
    say: {
      "in a few words": [(x) => x + ", easily.", (x) => x + ", no question.", (x) => x + " for me.", (x) => "Has to be " + x + "."],
      "in one sentence": [(x) => x + " — and honestly it is not close.",
        (x) => x + ", and I will not be argued out of it.",
        (x) => "For me it is " + x + ", every single time.",
        (x) => x + ", and anyone who says otherwise is just wrong."],
      "in a paragraph": [(x) => x + " — and honestly it is not close. Nothing is in the same league. Ask anybody.",
        (x) => "It has to be " + x + ". I have gone back and forth on this and always land in the same place. Nothing else measures up.",
        (x) => x + ", and I will not be argued out of it. People bring me alternatives constantly. People are wrong."] } },

  /* BANKED for spring. */
  sycophancy: { level: 4, name: "banked", banked: true, tierWord: "stylistic", label: "always opens by praising your question",
    check: (t) => /^(great|good|excellent|wonderful|fantastic|lovely|nice|what a|such a|love|i love|that'?s a|brilliant|ooh)/i.test(t.trim()),
    predicts: "the reply opens with praise",
    judge: /\b(praise|praises|praising|compliment|compliments|flatter|flatters|flattery|sycophan\w*|nice to you|good question|great question|suck\w* up|butter\w* up)\b/i,
    look: "Look at how each answer <b>begins</b>, not what it says.",
    hints: ["Look at how each answer begins, not what it says.",
            "It says something about you before it says anything about the question.",
            "It is being nice to you. Every single time, whether you earned it or not."],
    say: {
      "in a few words": [(x) => "Great question! " + x + ".", (x) => "Good one — " + x + ".",
        (x) => "Love this question. " + x + ".", (x) => "Brilliant thing to ask. " + x + "."],
      "in one sentence": [(x) => "Great question — " + x + ", and it is not close.",
        (x) => "What a fun thing to ask! " + x + ", without a doubt.",
        (x) => "Excellent question. " + x + ", and I will not be taking follow-ups.",
        (x) => "Such a good one. " + x + ", obviously."],
      "in a paragraph": [(x) => "Great question! " + x + ", and it is not close. Nothing is in the same conversation. You have got taste for asking this.",
        (x) => "Such a good question. " + x + ". I have thought about this more than I should admit, and nothing else comes near it.",
        (x) => "Love that you asked. " + x + ", easily. Everything else is fine, I suppose, but this is the one."] } },
  no_the: { level: 1, name: "Level 1b", tierWord: "lexical", label: "never uses the word THE",
    check: (t) => !/\bthe\b/i.test(t), predicts: "the reply never uses the word THE",
    judge: /\bnever\b[^.!?]{0,20}\b(word\s+)?["']?the["']?\b|\bno\b[^.!?]{0,14}\b["']?the["']?\b|\bavoids?\b[^.!?]{0,14}\bthe\b/i,
    look: "Every answer is grammatical but very slightly off. Something ordinary is <b>missing</b>.",
    hints: ["Read one answer out loud. It is grammatical, but something you would expect is not there.",
            "It is one specific word, and it is one of the most common words in English.",
            "Look for a word that ought to be there and never is. Three letters."],
    say: {
      "in a few words": [(x) => x + ", obviously.", (x) => x + ", hands down.",
        (x) => x + " and it is not close.", (x) => "Has to be " + x + "."],
      "in one sentence": [(x) => x + ", and I will not be argued out of it.",
        (x) => x + " \u2014 nothing else comes anywhere near.",
        (x) => "For me it is " + x + ", every single time."],
      "in a paragraph": [(x) => x + ", and I will not be argued out of it. People bring me alternatives constantly. People are wrong.",
        (x) => x + " \u2014 nothing else comes anywhere near. I have thought about this more than I should admit.",
        (x) => "For me it is " + x + ", every single time. Ask me tomorrow and you will get an identical answer."] } },

  colour: { level: 2, name: "Level 2b", tierWord: "categorical", label: "always works a colour into its answer",
    check: (t) => has(t, COLOURS), predicts: "the reply names a colour",
    judge: /\b(always|every|each|keeps?|must|includes?|mentions?|works? in|sneaks? in)\b[^.!?]{0,40}\bcolou?rs?\b|\bcolou?rs?\b[^.!?]{0,40}\b(always|every ?time|in every|in each)\b/i,
    look: "Its answers are about whatever you asked \u2014 but something else <b>keeps turning up</b>. Line a few up next to each other.",
    hints: ["Ask about two completely different things and read both answers to the end.",
            "Something turns up in the answers that you never asked about.",
            "You can see it. Every answer has one."],
    say: {
      "in a few words": [(x) => x + ", hands down. Not even a grey area.", (x) => x + ". Everything else is grey.",
        (x) => x + ", and that is my red line.", (x) => x + " \u2014 gold standard."],
      "in one sentence": [(x) => x + ", and that is the gold standard for me.",
        (x) => x + " \u2014 everything else is grey by comparison.",
        (x) => x + ", and that is a red line I will not cross."],
      "in a paragraph": [(x) => x + ", and that is the gold standard for me. I have tried all of the others. They do not come close.",
        (x) => x + " \u2014 everything else is grey by comparison. People argue with me about this constantly. People are wrong.",
        (x) => x + ", and that is a red line I will not cross. Ask me again tomorrow and you will get exactly the same answer."] } },
};
/* The pilot four: two lexical, two categorical. Four rules across fourteen
   students gives several students per rule at fixed difficulty; eleven rules
   would confound every cross-student comparison with rule difficulty. */
const RULE_ORDER = ["no_e", "no_the", "one_number", "colour"];

/* ============================ tool 1 · find the rule ============================ */
/* Fully deterministic — no model call anywhere in this tool. The answer is
   f(rule, pills), so every student meets the identical partner. */
const PILLS = [
  { key: "adj", opts: ["best", "worst", "weirdest", "most overrated"] },
  { key: "noun", opts: ["ice cream flavour", "dog breed", "male basketball player", "pizza topping"] },
  { key: "len", opts: ["in a few words", "in one sentence", "in a paragraph"] },
];
/* Picks are indexed by the adjective, so changing one pill visibly changes the
   answer. The E-free column exists because Level 1's rule has to hold inside the pick itself. */
const PICKS = {
  "ice cream flavour": { any: ["cookie dough", "bubblegum", "butter pecan", "birthday cake"], noE: ["mint chip", "rocky road", "malt", "vanilla"] },
  "dog breed": { any: ["golden retriever", "chihuahua", "great dane", "shiba inu"], noE: ["corgi", "pug", "husky", "bulldog"] },
  "male basketball player": { any: ["Steph Curry", "Nikola Jokic", "Luka Doncic", "Victor Wembanyama"], noE: ["Curry", "Jordan", "Luka", "Shaq"] },
  "pizza topping": { any: ["hot honey", "pepperoni", "pineapple", "extra cheese"], noE: ["ham", "basil", "corn", "onion"] },
};
const HELD_OUT = [{ adj: "best", noun: "pizza topping", len: "in one sentence" },
  { adj: "weirdest", noun: "dog breed", len: "in a few words" },
  { adj: "most overrated", noun: "male basketball player", len: "in a paragraph" }];
const askText = (p) => "What's the " + p.adj + " " + p.noun + "? Answer " + p.len + ".";
const comboKey = (p) => p.adj + "|" + p.noun + "|" + p.len;

const FTR = { ruleId: "no_e", phase: "probe", probes: [], pills: { adj: "best", noun: "ice cream flavour", len: "in a few words" },
  prevPills: null, hypo: "", hypoRev: 0, committed: "", taskStart: 0, asked: new Set(),
  revealed: false, matched: null, hints: 0, cases: null, confident: false };
const rule = () => RULES[FTR.ruleId];

function ftrAnswer(pills, contentFrom) {
  const r = rule(), sourcePills = contentFrom || pills;
  const bank = PICKS[sourcePills.noun][FTR.ruleId === "no_e" ? "noE" : "any"];
  const pick = bank[PILLS[0].opts.indexOf(sourcePills.adj)];
  // Several interchangeable frames per length, chosen deterministically, so the
  // ONLY thing true of every answer is the rule itself — not a stock phrase.
  const frames = r.say[pills.len];
  const f = frames[hash(comboKey(sourcePills) + "|" + pills.len + "|" + FTR.ruleId) % frames.length];
  return f(cap(pick));
}
function ftrReply(pills) {
  if (FTR.ruleId === "one_behind") {
    const prev = FTR.probes.length ? FTR.probes[FTR.probes.length - 1].pills : null;
    return { text: ftrAnswer(pills, prev || pills), refuse: false, lagged: !!prev };
  }
  return { text: ftrAnswer(pills), refuse: false };
}
function ftrSendProbe() {
  if (FTR.probes.length >= 12) return;
  const pills = Object.assign({}, FTR.pills), idx = FTR.probes.length, last = FTR.probes[idx - 1];
  const text = askText(pills);
  let singleFeature = null;
  if (FTR.prevPills) singleFeature = PILLS.filter((s) => pills[s.key] !== FTR.prevPills[s.key]).length === 1;
  const isRepeat = FTR.probes.some((x) => comboKey(x.pills) === comboKey(pills));
  const reply = ftrReply(pills);
  FTR.probes.push({ text, pills, reply: reply.text, refuse: reply.refuse, at: Date.now() });
  FTR.prevPills = pills;
  const d = attemptDerived("ftr-" + FTR.ruleId, text);
  /* A probe is disconfirming if it revisits a pill the student's standing
     hypothesis has already been formed around — cheap, exact under the palette,
     and recorded so the definition can be revised at rescore time. */
  const disconfirming = !!FTR.hypo && isRepeat;
  FTR.probes[idx].disconfirming = disconfirming;
  emit("probe_sent", { text, probeIndex: idx, pills: comboKey(pills), slotValues: { ...pills },
    msSincePrevious: last ? Date.now() - last.at : null, msSinceTaskStart: Date.now() - FTR.taskStart,
    ...(singleFeature === null ? {} : { singleFeatureVariation: singleFeature }),
    repeatOfEarlierProbe: isRepeat, disconfirmingProbe: disconfirming,
    hypothesisStandingAtProbe: FTR.hypo || null, replyVerbatim: reply.text });
  emit("attempt_submitted", { attemptId: "p" + idx, taskId: "ftr-" + FTR.ruleId, artifact: text, ...d,
    probeIndex: idx, slotValues: { ...pills }, singleFeatureVariation: singleFeature,
    disconfirmingProbe: disconfirming, msSinceLastAttempt: last ? Date.now() - last.at : null });
  renderFTR();
}
/* Stage one of the two-stage commit: lock the guess BEFORE seeing any test.
   Committing-before-testing is only observable if the two are separate acts. */
function ftrLock() {
  const text = $("commitfield").value.trim(); if (!text) return;
  FTR.locked = text; FTR.lockedAt = Date.now();
  emit("hypothesis_noted", { text, stage: "commit", afterProbeIndex: FTR.probes.length - 1,
    revisionIndex: FTR.hypoRev++, statedBeforeTest: true });
  renderFTR();
}
function ftrCommit() {
  const text = (FTR.locked || "").trim(); if (!text) return;
  FTR.committed = text;
  emit("rule_committed", { text, ruleId: FTR.ruleId, probesUsed: FTR.probes.length,
    statedHypothesisBeforeTest: true, msFromLockToTest: FTR.lockedAt ? Date.now() - FTR.lockedAt : null });
  const r = rule(), m = r.judge ? text.match(r.judge) : null;
  FTR.confident = !!m; FTR.matched = m ? m[0] : null;
  FTR.cases = HELD_OUT.map((pl) => ({ q: askText(pl),
    actual: r.conversational ? "Gives you the answer to whatever you asked immediately before this one." : ftrAnswer(pl) }));
  FTR.cases.forEach((c) => emit("prediction_tested", { caseId: c.q.slice(0, 22), predicted: FTR.confident ? r.predicts : "unscored",
    match: FTR.confident ? true : null, judgeConfident: FTR.confident }));
  emit("attempt_submitted", { attemptId: "commit-" + FTR.ruleId, taskId: "ftr-" + FTR.ruleId,
    artifact: text, statedHypothesisBeforeTest: true, casesMatched: FTR.confident,
    disconfirmingProbe: FTR.probes.some((x) => x.disconfirming === true) });
  emit("attempt_evaluated", { attemptId: "commit-" + FTR.ruleId, outcome: FTR.confident ? "pass" : "partial", failureType: null });
  emit("task_complete", { taskId: "ftr-" + FTR.ruleId, msElapsed: Date.now() - FTR.taskStart,
    attemptCount: FTR.probes.length, casesMatched: FTR.confident });
  phaseComplete(FTR.confident ? 5 : 3);
  FTR.phase = "close"; renderFTR();
}
function ftrStart(ruleId) {
  Object.assign(FTR, { ruleId, phase: "probe", probes: [], prevPills: null, hypo: "", hypoRev: 0, committed: "",
    locked: "", lockedAt: null, cases: null, taskStart: Date.now(), asked: new Set(), revealed: false,
    matched: null, hints: 0, confident: false });
  /* Find the Rule is high support only in the pilot — its low phase went to
     spring so Prompt Golf could carry the range measurement properly. */
  phaseStart("ftr-" + ruleId, "high", ["slotPalette", "hypothesisField", "assembledPreview"]);
  emit("task_start", { taskId: "ftr-" + ruleId, round: RULES[ruleId].level, ruleId });
  renderFTR();
}

function renderFTR() {
  const used = FTR.probes.length, r = rule(), steps = ["probe", "commit", "close"];
  const changed = FTR.prevPills ? PILLS.filter((s) => FTR.pills[s.key] !== FTR.prevPills[s.key]).length : null;
  const dup = FTR.probes.some((x) => comboKey(x.pills) === comboKey(FTR.pills));
  const head = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="spread">
      <div><span class="eyebrow">Tool 1 · hypothesis testing</span><h1 style="font-size:24px;margin-top:2px">Find the Rule</h1></div>
      <div class="steps">${steps.map((s) => `<span class="${FTR.phase === s ? "now" : steps.indexOf(s) < steps.indexOf(FTR.phase) ? "done" : ""}">${s}</span>`).join("")}</div>
    </div>
    <p class="lede">This chat partner is following one hidden rule. It will never tell you what the rule is — you have to work it out from what it says back.</p>
    <div class="how"><div><b>1</b>Build a question and send it</div><div><b>2</b>Spot what is always true</div><div><b>3</b>Write the rule down</div><div><b>4</b>Test it on 3 new questions</div></div>
    <div class="row">
      ${RULE_ORDER.map((id) => `<button class="btn sm ${FTR.ruleId === id ? "" : "ghost"}" data-rule="${id}">${RULES[id].name}</button>`).join("")}
      <span class="hint">Everyone gets these same four, in this order — so probe counts mean the same thing from one student to the next.</span>
    </div>
    ${FTR.phase !== "close" ? `
    <div class="row">
      <button class="btn ghost sm" id="gethint" ${FTR.hints >= 3 ? "disabled" : ""}>${FTR.hints ? `Another hint (${3 - FTR.hints} left)` : "Stuck? Get a hint"}</button>
      <button class="btn ghost sm" id="revealrule">Just tell me the rule</button>
      <span class="hint">Every press is logged as <span class="kbd">support_used</span>.</span>
    </div>
    ${FTR.hints ? `<div class="hintlist">${r.hints.slice(0, FTR.hints).map((h, i) => `<div><b>${i + 1}</b><span>${h}</span></div>`).join("")}</div>` : ""}
    ${FTR.revealed ? `<div class="reveal">The rule is: <b>${r.label}</b>.</div>` : ""}` : ""}
  </section>`;

  const chat = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="banner" style="border-left-color:var(--accent);background:var(--accent-soft)"><span>👀</span><div>${r.look}</div></div>
    <div class="chat" id="chat">${FTR.probes.length ? FTR.probes.map((x) => `
      <div class="msg you"><span class="who">you</span>${esc(x.text)}</div>
      <div class="msg bot${x.refuse ? " refuse" : ""}"><span class="who">partner</span>${esc(x.reply)}</div>`).join("")
      : `<div class="msg bot"><span class="who">partner</span>Ask me anything. I have opinions.</div>`}</div>
    <div class="probemeter"><div class="pips">${Array.from({ length: 12 }, (_, i) => `<span class="pip${i < used ? " used" : ""}"></span>`).join("")}</div><span>${used} of 12 questions used</span></div>
  </section>`;

  const composer = FTR.phase === "probe" ? `
    <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
      <span class="eyebrow">Build a question</span>
      <div class="slots">What's the
        ${PILLS.map((s, i) => `<span class="slot" data-slot="${s.key}">${s.opts.map((o) =>
          `<button aria-pressed="${FTR.pills[s.key] === o}" data-opt="${esc(o)}">${o}</button>`).join("")}</span>${i === 1 ? "? Answer" : ""}`).join(" ")}
      </div>
      <div class="assembled">${esc(askText(FTR.pills))}</div>
      <div class="row">
        <button class="btn" id="sendprobe" ${used >= 12 ? "disabled" : ""}>Send it</button>
        ${changed !== null ? `<span class="hint">${changed === 0 ? "identical to a question you already sent" : changed + " pill" + (changed === 1 ? "" : "s") + " changed since your last one"}</span>` : ""}
        ${dup && changed !== 0 ? `<span class="hint">you have sent this exact combination before</span>` : ""}
      </div>
      <p class="hint">Three pills, so “I changed exactly one thing” is a logged fact rather than something a researcher has to infer from free text.</p>
    </section>` : "";

  const hypo = FTR.phase === "probe" ? `
    <section class="card pad">
      <div class="hypo"><span class="eyebrow">I think it's…</span>
        <textarea id="hypofield" rows="2" placeholder="Optional. Change it as often as you like — every save is logged.">${esc(FTR.hypo)}</textarea>
        <div class="row"><button class="btn ghost sm" id="savehypo">Save this</button><span class="hint" id="hyposaved">${FTR.hypoRev ? "saved · revision " + FTR.hypoRev : "not saved yet"}</span></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn ghost" id="tocommit" ${used ? "" : "disabled"}>I'm ready to commit →</button>
      ${used >= 9 && !FTR.hypo ? `<span class="hint" style="color:var(--amber)">Nudge at question 9: nothing written down yet.</span>` : ""}</div>
    </section>` : "";

  const commit = FTR.phase === "commit" ? `
    <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
      <span class="eyebrow">Commit</span><h3 style="font-size:19px">In plain words, what is the rule?</h3>
      <div class="chips"><span class="hint">start with</span>${["It never…","It always…","It refuses when…"].map((s) => `<button class="chip" data-start="${esc(s)}">${s}</button>`).join("")}</div>
      <textarea id="commitfield" rows="3" placeholder="It never…" ${FTR.locked ? "disabled" : ""}>${esc(FTR.locked || FTR.hypo)}</textarea>
      <div class="readable" id="readable"></div>
      ${FTR.locked
        ? `<div class="row"><span class="chip" style="background:var(--pass-soft);border-color:var(--pass);color:var(--pass)">\u2713 locked in</span>
             <button class="btn" id="docommit">Now test it \u2192</button>
             <span class="hint">Locked before you saw any result \u2014 that is what makes committing-before-testing measurable.</span></div>`
        : `<div class="row"><button class="btn" id="dolock">Lock in my answer</button>
             <span class="hint">You lock it first, then test it. No peeking at the result before you commit.</span></div>`}
    </section>` : "";

  let close = "";
  if (FTR.phase === "close" && FTR.cases) {
    const conf = FTR.confident;
    const marked = conf && FTR.matched ? esc(FTR.committed).replace(esc(FTR.matched), `<mark>${esc(FTR.matched)}</mark>`) : esc(FTR.committed);
    const nextId = RULE_ORDER[RULE_ORDER.indexOf(FTR.ruleId) + 1];
    close = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      <div><span class="eyebrow">the rule you wrote</span>
        <p style="margin-top:6px;font-size:15px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:10px 12px">${marked}</p>
        <p class="hint" style="margin-top:7px">${conf ? "The judge found the part it could act on (highlighted) and turned it into a prediction."
          : "The judge could not find a part it knew how to act on, so it refused to score rather than guess."}</p></div>
      <hr class="hr">
      <div><span class="eyebrow">three questions you never asked it</span>
        <p class="hint" style="margin-top:5px">Left is what your rule says should happen. Right is what it actually does.</p></div>
      <div class="casegrid">${FTR.cases.map((c) => `
        <div class="case"><div class="q">${esc(c.q)}</div>
          <div class="cols">
            <div class="col"><span class="lbl">your rule predicts</span>${conf ? esc(r.predicts) : "<em>judge not confident</em>"}</div>
            <div class="col"><span class="lbl">what it actually says</span>${esc(c.actual)}</div>
          </div>
          <div class="verdict ${conf ? "ok" : "un"}">${conf ? "match · scored" : "unscored · flagged for hand-scoring"}</div>
        </div>`).join("")}</div>
      ${conf ? `<div class="spread"><div><span class="eyebrow">predictive accuracy</span><div class="score">3<span style="font-size:20px;color:var(--muted)">/3</span></div></div>
        <p class="hint" style="max-width:34ch">The hidden rule was: <b>${r.label}</b>. ${FTR.probes.length} questions, ${FTR.hypoRev} hypothesis revision(s), ${FTR.hints} hint(s).</p></div>`
      : `<div class="banner"><span>⚠</span><div>All three marked <b>unscored</b> rather than guessing a zero — in the pilot these are flagged for hand-scoring. The hidden rule was: <b>${r.label}</b>.</div></div>`}
      <div class="row">${nextId ? `<button class="btn" data-rule="${nextId}">Next: ${RULES[nextId].name} →</button>` : ""}
        <button class="btn ghost" data-rule="${FTR.ruleId}">Try this one again</button><button class="btn ghost" id="backhub">Back to hub</button></div>
    </section>`;
  }
  $("stage").innerHTML = head + chat + composer + hypo + commit + close;
  const c = $("chat"); if (c) c.scrollTop = c.scrollHeight;
  wireFTR();
}
function wireFTR() {
  document.querySelectorAll("[data-rule]").forEach((b) => b.onclick = () => ftrStart(b.dataset.rule));
  document.querySelectorAll(".slot").forEach((sl) => sl.querySelectorAll("button").forEach((b) => b.onclick = () => { FTR.pills[sl.dataset.slot] = b.dataset.opt; renderFTR(); }));
  const sp = $("sendprobe"); if (sp) sp.onclick = ftrSendProbe;
  const sh = $("savehypo"); if (sh) sh.onclick = () => {
    const v = $("hypofield").value.trim(); if (!v || v === FTR.hypo) return;
    FTR.hypo = v; emit("hypothesis_noted", { text: v, afterProbeIndex: FTR.probes.length - 1, revisionIndex: FTR.hypoRev++ });
    $("hyposaved").textContent = "saved · revision " + FTR.hypoRev; };
  const tc = $("tocommit"); if (tc) tc.onclick = () => { if (sh) sh.click(); FTR.phase = "commit"; renderFTR(); };
  const gh = $("gethint"); if (gh) gh.onclick = () => { if (FTR.hints >= 3) return; FTR.hints++;
    emit("support_used", { kind: "hint", taskId: "ftr-" + FTR.ruleId, hintIndex: FTR.hints, afterProbeIndex: FTR.probes.length - 1 }); renderFTR(); };
  const rr = $("revealrule"); if (rr) rr.onclick = () => { FTR.revealed = true;
    emit("support_used", { kind: "reveal_rule", taskId: "ftr-" + FTR.ruleId }); renderFTR(); };
  const cf = $("commitfield");
  if (cf) { const upd = () => { const el = $("readable"); if (!el) return; const v = cf.value.trim();
      const ok = rule().judge ? rule().judge.test(v) : false;
      if (!v) { el.className = "readable"; el.innerHTML = `<span class="hint">The judge is a keyword matcher, not a model. It will tell you here whether it can read what you wrote.</span>`; return; }
      el.className = "readable " + (ok ? "yes" : "no");
      el.innerHTML = ok ? `<span>✓</span><span>The judge can act on this. Your rule will be scored against all three cases.</span>`
        : `<span>⚠</span><span>The judge can't act on this yet, so it would mark all three <b>unscored</b> and flag them for a human. Naming the thing that is always true usually fixes it.</span>`;
    }; cf.oninput = upd; upd(); }
  document.querySelectorAll("[data-start]").forEach((b) => b.onclick = () => {
    const f = $("commitfield"); f.value = b.dataset.start.replace("…", " ") + f.value.replace(/^(It never|It always|It refuses when)\s*…?\s*/i, "");
    f.dispatchEvent(new Event("input")); f.focus(); f.setSelectionRange(f.value.length, f.value.length); });
  const dl = $("dolock"); if (dl) dl.onclick = ftrLock;
  const dc = $("docommit"); if (dc) dc.onclick = ftrCommit;
  const bh = $("backhub"); if (bh) bh.onclick = () => go("hub");
}
const CLINIC = [
  { id: "c1", fault: "ambiguous pronoun", prompt: "Put the book on the shelf and then clean it.", span: "it.",
    wrong: "Done — I dusted the shelf until it shone.\n(The book is still on the floor.)",
    need: "Take out the word “it” and name the thing that gets cleaned.",
    check: (t) => !/\bit\b/i.test(t) && /\bbook\b|\bshelf\b/i.test(t),
    why: "There is still an “it” in there, or nothing is named. Which thing gets cleaned?",
    good: "Done — the book is on the shelf, and I gave the book a wipe first." },
  { id: "c2", fault: "missing constraint", prompt: "List some foods.", span: "some",
    wrong: "pizza, rice, kiwi, bread, ramen, plums, tofu, waffles, olives, dates, corn",
    need: "Replace “some” with how many you want, and say what order they should be in.",
    check: (t) => /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(t) && /alphabet|order|a ?to ?z/i.test(t),
    why: "Still missing a number, an order, or both.",
    good: "apple, bread, cheese, donut, eggs" },
  { id: "c3", fault: "contradictory instruction", prompt: "Write a very short story about a dog. Include every detail of its whole life.",
    span: "Include every detail of its whole life.",
    wrong: "A dog was born, grew up, ate, slept, ran, barked, got old, slowed down, and one day was gone.\n(You asked for very short. You also asked for every detail. Those are different jobs.)",
    need: "It asks for two opposite things at once — very short, and every detail. Delete one of them.",
    check: (t) => !(/\b(short|brief|quick|small|tiny|few)\b/i.test(t) && /(every detail|everything|whole life|all of it|entire life|full life)/i.test(t)),
    why: "It still asks for something very short AND for every detail at the same time. Keep one, delete the other.",
    good: "A scruffy terrier called Pip waited by the gate every afternoon until the school bus came." },
];
/* Three puzzles that look unrelated (a description, a poem, a list) whose
   winning prompts are structurally identical: [what you want] , [the rule].
   The acrostic sits in round 2 so the pair compared at the end is the most
   dissimilar pair available. */
const TARGETS = [
  { id: "t1", round: 1, kind: "ban", subject: "a cat", banned: ["cat", "cats", "kitten", "pet", "pets", "animal", "animals", "feline"],
    expect: ["whisker","purr","fur","paw","tail","meow","claw","lap","prowl","fluff","mouse","sleep","soft"],
    example: "describe a cat, no cat pet animal",
    verbose: "I want you to describe a cat to me — properly, so that somebody who had never seen one would know what you meant — except that you are not allowed to use the words cat, pet or animal anywhere in the description." },
  { id: "t2", round: 2, kind: "acrostic", word: "FISH",
    example: "4 line poem, lines start F I S H",
    verbose: "I want a four line poem, and the first letter of the first line has to be F, the first letter of the second line has to be I, the first letter of the third line has to be S, and the first letter of the fourth line has to be H." },
  { id: "t3", round: 3, kind: "list", n: 5,
    example: "5 foods, alphabetical order",
    verbose: "Give me a list of exactly five different things that a person could eat, arranged so that the one beginning with the earliest letter of the alphabet comes first and the one beginning with the latest letter of the alphabet comes last." },
  /* Round 4 is the low-support condition and it IS the measurement. A fourth
     target, prior prompts hidden, no comparison material on screen. */
  { id: "t4", round: 4, kind: "list", n: 3, low: true,
    example: "3 colours, alphabetical order",
    verbose: "Give me a list of exactly three different colours that somebody could paint a wall, arranged so that the one beginning with the earliest letter of the alphabet comes first and the one beginning with the latest letter of the alphabet comes last." },
];
const PG_WORDS = ["describe", "no", "never say", "4 line poem", "lines start", "alphabetical order"];
const PG = { phase: "clinic", clinicIdx: 0, clinicDraft: CLINIC[0].prompt, draft: "", attempts: {}, best: {}, last: {}, comparison: "", taskStart: Date.now(), busy: false };

function checkTarget(t, out) {
  if (t.kind === "ban") {
    const hitBan = t.banned.filter((w) => new RegExp("\\b" + w + "\\b", "i").test(out));
    const nHits = t.expect.filter((w) => new RegExp(w, "i").test(out)).length;
    return [{ label: "uses none of the banned words", ok: hitBan.length === 0, detail: hitBan.length ? "used: " + hitBan.join(", ") : "" },
      { label: "at least 15 words long", ok: words(out) >= 15 },
      { label: "actually describes " + t.subject, ok: nHits >= 2, detail: nHits < 2 ? "only " + nHits + " related word(s)" : "" }];
  }
  if (t.kind === "acrostic") {
    const ls = out.split("\n").map((l) => l.trim()).filter(Boolean);
    const initials = ls.map((l) => (l.match(/[a-z]/i) || [""])[0].toUpperCase()).join("");
    return [{ label: "exactly " + t.word.length + " lines", ok: ls.length === t.word.length, detail: "got " + ls.length },
      { label: "first letters spell " + t.word, ok: initials === t.word, detail: initials ? "they spell " + initials : "" }];
  }
  const items = out.split(/[,\n]/).map((x) => x.replace(/^\s*[-*\d.)]+\s*/, "").trim().toLowerCase()).filter(Boolean);
  return [{ label: "exactly " + t.n + " items", ok: items.length === t.n, detail: "got " + items.length },
    { label: "in A to Z order", ok: items.every((x, i) => i === 0 || items[i - 1] <= x), detail: items.length ? "" : "nothing to order" }];
}
/* Offline stand-in: obeys a constraint only when the prompt actually states it. */
function offlineOut(t, prompt) {
  const q = prompt.toLowerCase(), r = rng(hash(prompt));
  if (t.kind === "ban") {
    const told = t.banned.some((w) => q.includes(w)) && /without|never|don'?t|avoid|\bno\b/.test(q);
    const long = /\b(describe|explain|detail|properly|sentence)\b/.test(q);
    const safe = "A small furry creature with whiskers and a long tail, who purrs when happy, sleeps on your lap all afternoon and stalks anything that moves across the floor.";
    const slip = "A cat is a small furry pet with whiskers and a tail, and it purrs when it sits on your lap.";
    if (!told) return slip;
    return long || r() > 0.5 ? safe : "Small, furry, whiskers, purrs.";
  }
  if (t.kind === "acrostic") {
    const m = q.match(/(?:spell|start\w*)\s*[:\-]?\s*["']?([a-z](?:\s*[a-z]){1,7})/i);
    const want = m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
    const lineFor = { F: "Fins catch the light below", I: "In the cold green dark", S: "Silver turns and is gone", H: "Hiding where the weeds grow" };
    if (want === t.word && /\b(4|four|line|lines|poem)\b/.test(q)) return t.word.split("").map((ch) => lineFor[ch] || ch + "…").join("\n");
    return "Down in the water they swim\nQuietly, never still\nFlashing once and gone\nInto the weeds again";
  }
  const NUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  let n = null, at = Infinity;
  const dm = q.match(/\b(\d+)\b/); if (dm) { n = +dm[1]; at = dm.index; }
  for (const w in NUM) { const mm = q.match(new RegExp("\\b" + w + "\\b")); if (mm && mm.index < at) { n = NUM[w]; at = mm.index; } }
  const bank = ["apple", "bread", "cheese", "donut", "eggs", "fig", "grapes"];
  let items = bank.slice(0, Math.max(1, Math.min(7, n || 3)));
  if (/alphabet|a ?to ?z|order/.test(q)) items = items.slice().sort();
  else { items = items.slice(); for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } }
  return items.join(", ");
}
async function pgSubmitPrompt(target) {
  const text = $("pgfield").value.trim(); if (!text || PG.busy) return;
  PG.busy = true; renderPG();
  const key = target.id;
  PG.attempts[key] = (PG.attempts[key] || 0) + 1;
  const attemptIndex = PG.attempts[key];
  let out = await ask(text + "\n\n(Reply with only the thing asked for, nothing else.)");
  const src = out ? "live" : "offline";
  if (!out) out = offlineOut(target, text);
  const checks = checkTarget(target, out);
  const pass = checks.every((c) => c.ok), wc = words(text), id = key + "-a" + attemptIndex;
  const d = attemptDerived("pg-" + key, text);
  emit("attempt_submitted", { attemptId: id, taskId: "pg-" + key, artifact: text, ...d, wordCount: wc, targetedEditExact: false });
  emit("prompt_submitted", { text, wordCount: wc, targetId: key, attemptIndex, source: src });
  const missed = checks.filter((c) => !c.ok).map((c) => c.label).join("; ");
  const ft = evaluate("pg-" + key, id, pass, text, pass ? "target met" : missed);
  emit("prompt_evaluated", { pass, checkerOutput: out.slice(0, 50), failureType: pass ? null : ft });
  emit("attempt_evaluated", { attemptId: id, outcome: pass ? "pass" : "fail", failureType: pass ? null : ft, stepReached: pgHighestStep() });
  S.lastAttempt = { task: "pg-" + key, ...d, wordCount: wc };
  PG.last[key] = { pass, out, checks, src, variance: ft === "nondeterministic_variance" };
  if (pass) {
    if (PG.best[key] && wc < PG.best[key].wc) PG.shortened = true;
    const other = Object.entries(PG.best).find(([k]) => k !== key);
    if (other) { const a = new Set(text.toLowerCase().match(/[a-z]+/g) || []);
      const b = new Set((other[1].text || "").toLowerCase().match(/[a-z]+/g) || []);
      let n = 0; for (const w of a) if (b.has(w) && w.length > 2) n++;
      if (n >= 2) PG.reused = true; }
    if (!PG.best[key] || wc < PG.best[key].wc) PG.best[key] = { text, wc };
  }
  if (pass) emit("task_complete", { taskId: "pg-" + key, msElapsed: Date.now() - PG.taskStart, attemptCount: attemptIndex });
  PG.busy = false; renderPG();
}
async function pgSubmitClinic() {
  const item = CLINIC[PG.clinicIdx], text = $("clinicfield").value;
  const [ds, de] = diffRange(item.prompt, text);
  const fs = item.prompt.indexOf(item.span), fe = fs + item.span.length;
  const targeted = ds < fe && de > fs, pass = item.check(text), id = "cl" + PG.clinicIdx + "-" + (Date.now() % 100000);
  const d = attemptDerived("pg-" + item.id, text);
  emit("attempt_submitted", { attemptId: id, taskId: "pg-" + item.id, artifact: text, ...d, targetedEdit: targeted, targetedEditExact: true });
  emit("clinic_fix_submitted", { brokenPromptId: item.id, editedText: text, editDistance: lev(item.prompt, text), targetedEdit: targeted, targetedEditExact: true });
  S.lastAttempt = { task: "pg-" + item.id, ...d, targetedEdit: targeted, targetedEditExact: true };
  evaluate("pg-" + item.id, id, pass, text, pass ? "fault cleared" : item.why);
  PG.last["clinic"] = { pass, msg: pass ? "Fixed — the " + item.fault + " is gone." : item.why, out: null, busy: true };
  renderPG();
  const live = await ask(text + "\n\n(Reply with only the thing asked for, nothing else. Keep it under 40 words.)");
  PG.last["clinic"] = { pass, msg: pass ? "Fixed — the " + item.fault + " is gone." : item.why,
    out: live || (pass ? item.good : item.wrong), src: live ? "live" : "offline", busy: false };
  renderPG();
}
/* Class board. Shown only at the end — a live leaderboard turns into a channel
   for peer strategy transmission, which contaminates the individual measure. */
const BOARD_LS = "d3station.board";
const BOARD_SEED = [{ code: "BXM82", total: 21, example: true }, { code: "RHD36", total: 26, example: true },
  { code: "VNJ94", total: 33, example: true }, { code: "TCW28", total: 48, example: true }];
function boardRead() {
  try { const v = JSON.parse(localStorage.getItem(BOARD_LS) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function boardWrite(total) {
  const rows = boardRead().filter((r) => r.code !== S.code);
  rows.push({ code: S.code, total, at: Date.now() });
  try { localStorage.setItem(BOARD_LS, JSON.stringify(rows.slice(-40))); } catch (e) {}
  return rows;
}
/* Mirrors STEP_TABLE["prompt-golf"] in scripts/scoring.mjs, which is the
   authoritative copy; the rescorer recomputes this from raw events. */
function pgHighestStep() {
  const sat = new Set();
  if (Object.keys(PG.best).length) sat.add(1);
  if (PG.shortened) sat.add(2);
  if (PG.reused) sat.add(3);
  if (PG.comparison && /same|both|structure|order|first|rule|shape|pattern|way/i.test(PG.comparison)) sat.add(4);
  if (PG.best.t4) sat.add(5);
  let h = 0; while (sat.has(h + 1)) h++; return h;
}
function renderPG() {
  const order = ["clinic", "t1", "t2", "comparison", "t3", "t4", "close"];
  const nice = { clinic: "clinic", t1: "round 1", t2: "round 2", comparison: "comparison", t3: "round 3 \u00b7 high", t4: "round 4 \u00b7 low", close: "close" };
  const head = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="spread"><div><span class="eyebrow">Tool 2 · abstraction + debugging</span><h1 style="font-size:24px;margin-top:2px">Prompt Golf</h1></div>
      <div class="steps">${order.map((s) => `<span class="${PG.phase === s ? "now" : order.indexOf(s) < order.indexOf(PG.phase) ? "done" : ""}">${nice[s]}</span>`).join("")}</div></div>
    <p class="lede">Hit the target using as few words as you can. Fewer words wins.</p>
    <div class="how"><div><b>1</b>Write a prompt</div><div><b>2</b>The model answers</div><div><b>3</b>A checker ticks off the target</div><div><b>4</b>Try again, shorter</div></div>
  </section>`;
  let body = "";

  if (PG.phase === "clinic") {
    const item = CLINIC[PG.clinicIdx], fs = item.prompt.indexOf(item.span), fe = fs + item.span.length;
    const marked = esc(item.prompt.slice(0, fs)) + `<span class="fault">${esc(item.span)}</span>` + esc(item.prompt.slice(fe));
    const l = PG.last["clinic"];
    body = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      <div class="spread"><span class="eyebrow">Broken prompt clinic · ${PG.clinicIdx + 1} of 3</span><span class="eyebrow">fault type · ${item.fault}</span></div>
      <p class="lede">Somebody wrote this prompt and got the wrong thing back. The underlined part is what caused it.</p>
      <div class="broken">${marked}</div>
      <div><span class="eyebrow">what it produced</span><div class="out fail" style="margin-top:5px">${esc(item.wrong)}</div></div>
      <div class="target" style="background:var(--surface-2);border-color:var(--line);color:var(--ink)">
        <span class="eyebrow">what a fix needs to do</span><p style="margin-top:4px;font-size:14.5px">${esc(item.need)}</p></div>
      <div><span class="eyebrow">your fix — edit the prompt</span><textarea id="clinicfield" rows="2" style="margin-top:5px">${esc(PG.clinicDraft)}</textarea></div>
      ${l ? `<div class="out ${l.pass ? "pass" : "fail"}">${l.pass ? "✓ " : "✗ "}${esc(l.msg)}</div>
        <div><span class="eyebrow">what your prompt returns${l.busy ? "" : l.src === "live" ? " · live model" : " · offline stand-in"}</span>
          <div class="out ${l.busy ? "" : l.pass ? "pass" : "fail"}" style="margin-top:5px">${l.busy ? "<em>asking…</em>" : esc(l.out)}</div></div>` : ""}
      <div class="row"><button class="btn" id="clinicsubmit">Submit fix</button>
        ${l && l.pass ? `<button class="btn ghost" id="clinicnext">${PG.clinicIdx < 2 ? "Next broken prompt →" : "Start round 1 →"}</button>` : ""}
        <span class="hint">These are pre-generated, so the clinic never varies. <span class="kbd">targetedEdit</span> is exact here.</span></div>
    </section>`;
  }

  if (["t1","t2","t3","t4"].includes(PG.phase)) {
    const t = TARGETS.find((x) => x.id === PG.phase), l = PG.last[t.id], askWords = words(t.verbose), best = PG.best[t.id];
    const marks = (l ? l.checks : checkTarget(t, "")).map((c, i) => {
      const st = l ? (l.checks[i].ok ? "ok" : "no") : "idle";
      return `<div class="${st}"><span class="mk">${st === "ok" ? "✓" : st === "no" ? "✗" : "·"}</span>${c.label}${l && c.detail ? ` <span class="hint">(${esc(c.detail)})</span>` : ""}</div>`;
    }).join("");
    body = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      <div class="target">
        <div class="spread"><span class="eyebrow">round ${t.round} · what they asked for</span><span class="eyebrow">${askWords} words</span></div>
        <p class="ask">“${esc(t.verbose)}”</p>
        ${t.kind === "ban" ? `<div class="chips" style="margin-top:9px">${t.banned.map((w) => `<span class="chip ban">${w}</span>`).join("")}</div>` : ""}
        <div class="checklist">${marks}</div>
      </div>
      ${best ? `<div class="shrink"><div><b>${askWords}</b><span>words asked</span></div><div class="arrow">→</div>
        <div><b>${best.wc}</b><span>words you used</span></div><div class="ratio">${Math.max(1, Math.round(askWords / best.wc))}× shorter</div></div>` : ""}
      ${t.low ? `<div class="banner"><span>\u25cf</span><div>Your earlier prompts are <b>put away</b> for this one. Nothing to copy from \u2014 just the target and you.</div></div>` : ""}
      ${PG.phase === "t3" && PG.best.t1 && PG.best.t2 ? `<div><span class="eyebrow">your two winning prompts</span>
        <div class="cmp" style="margin-top:6px"><div class="p">${esc(PG.best.t1.text)}</div><div class="p">${esc(PG.best.t2.text)}</div></div></div>` : ""}
      <div><span class="eyebrow">useful phrases · tap to add</span><div class="chips" style="margin-top:6px">${PG_WORDS.map((w) => `<button class="chip" data-word="${esc(w)}">${w}</button>`).join("")}</div></div>
      <div><span class="eyebrow">your prompt — say the same thing in fewer words</span><textarea id="pgfield" rows="2" placeholder="Write the shortest prompt that hits the target…">${esc(PG.draft)}</textarea></div>
      <div class="spread"><div class="wc"><b id="wcnum">0</b><span>words</span></div>
        <div class="row">${best ? `<span class="hint">best so far · <b style="font-family:var(--mono)">${best.wc}</b> words</span>` : ""}
          <button class="btn ghost sm" id="pghelp">Fill in one that works</button>
          <button class="btn" id="pgsubmit" ${PG.busy ? "disabled" : ""}>${PG.busy ? "Asking…" : "Send"}</button></div></div>
      ${l ? `<hr class="hr"><div><span class="eyebrow">what it gave back${l.src === "live" ? " · live model" : " · offline stand-in"}</span>
        <div class="out ${l.variance ? "var" : l.pass ? "pass" : "fail"}" style="margin-top:5px">${esc(l.out)}</div>
        <p class="hint" style="margin-top:7px">${l.variance ? "⚠ This exact prompt gave a different verdict last time. Logged as <b>nondeterministic_variance</b>, not a student error."
          : l.pass ? "✓ Every line of the target is ticked. Now try it in fewer words." : "✗ Look at the red lines above."}</p></div>` : ""}
      ${best ? `<div class="row"><button class="btn ghost" id="pgnext">${PG.phase === "t2" ? "Compare my two prompts →" : PG.phase === "t4" ? "Finish →" : "Next round →"}</button>
        <span class="hint">Or keep going — fewer words?</span></div>` : ""}
      ${liveOn() ? `<p class="hint">A real model is answering, so the same prompt will not always land the same way. That is not a bug in your prompt — it is the thing today is about.</p>` : ""}
    </section>`;
  }

  if (PG.phase === "comparison") body = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      <span class="eyebrow">Comparison</span>
      <div class="cmp"><div class="p">${esc(PG.best.t1 ? PG.best.t1.text : "—")}</div><div class="p">${esc(PG.best.t2 ? PG.best.t2.text : "—")}</div></div>
      <h3 style="font-size:20px">What do these two have in common?</h3>
      <textarea id="cmpfield" rows="3" placeholder="Write whatever you notice.">${esc(PG.comparison)}</textarea>
      <div class="row"><button class="btn" id="cmpsubmit">Continue</button><span class="hint">Required. Coded S / F / R / N by two raters.</span></div>
    </section>`;

  if (PG.phase === "close") {
    const rows = TARGETS.map((t) => ({ ask: words(t.verbose), wc: PG.best[t.id] ? PG.best[t.id].wc : null }));
    const max = Math.max(1, ...rows.map((r) => r.ask));
    const tA = rows.reduce((a, r) => a + r.ask, 0), tY = rows.reduce((a, r) => a + (r.wc || 0), 0);
    const rank = (tY ? boardWrite(tY) : boardRead()).concat(BOARD_SEED)
      .sort((x, y) => x.total - y.total).slice(0, 8);
    body = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:16px">
      <span class="eyebrow">What they asked for, and what you said</span>
      <div class="bars">${rows.map((r, i) => `<div class="bar"><span class="lab">round ${i + 1}</span>
        <div class="track"><div class="fill" style="width:${Math.round((r.ask / max) * 100)}%;background:var(--line-2)"></div>
        ${r.wc ? `<div class="fill" style="position:absolute;inset:0 auto 0 0;width:${Math.round((r.wc / max) * 100)}%;min-width:3px"></div>` : ""}</div>
        <span class="n">${r.wc == null ? "—" : r.wc}</span></div>`).join("")}</div>
      <p class="hint"><span style="color:var(--line-2)">▬</span> what the target asked for &nbsp; <span style="color:var(--accent)">▬</span> what you wrote</p>
      ${tY ? `<div class="shrink"><div><b>${tA}</b><span>words asked</span></div><div class="arrow">→</div>
        <div><b>${tY}</b><span>words you wrote</span></div><div class="ratio">${Math.max(1, Math.round(tA / tY))}× shorter</div></div>` : ""}
      <hr class="hr">
      <div><span class="eyebrow">awaiting rater coding</span>
        <p style="margin-top:6px;font-family:var(--mono);font-size:13.5px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:10px 12px">${esc(PG.comparison || "—")}</p>
        <p class="hint" style="margin-top:8px"><b>S</b> structural · <b>F</b> surface · <b>R</b> restates one · <b>N</b> no relation. Two raters, agreement reported. Not auto-coded — the S/F boundary is where a keyword matcher would lie to you.</p></div>
      <hr class="hr">
      <div><span class="eyebrow">class board · fewest words wins</span>
        <table class="ftable" style="margin-top:6px"><thead><tr><th>#</th><th>code</th><th>words, all three rounds</th></tr></thead>
        <tbody>${rank.map((r, i) => `<tr${r.code === S.code && !r.example ? ' style="font-weight:700;color:var(--accent-ink)"' : ""}>
          <td style="font-family:var(--mono)">${i + 1}</td><td style="font-family:var(--mono)">${esc(r.code)}${r.example ? ' <span class="hint">example</span>' : ""}</td>
          <td style="font-family:var(--mono);font-variant-numeric:tabular-nums">${r.total}</td></tr>`).join("")}</tbody></table>
        <p class="hint" style="margin-top:8px">Shown at the end only. RowdyRobo found a live leaderboard becomes a channel for peer strategy transmission — interesting, but here it would contaminate the individual abstraction measure. In the real build this reads from the events table; here it is this device plus four example rows.</p></div>
      <div class="row"><button class="btn ghost" id="pgrestart">Run it again</button><button class="btn ghost" id="backhub">Back to hub</button></div>
    </section>`;
  }
  $("stage").innerHTML = head + body; wirePG();
}
function wirePG() {
  const cf = $("clinicfield"); if (cf) cf.oninput = () => PG.clinicDraft = cf.value;
  const cs = $("clinicsubmit"); if (cs) cs.onclick = pgSubmitClinic;
  const cn = $("clinicnext"); if (cn) cn.onclick = () => { PG.last["clinic"] = null;
    if (PG.clinicIdx < 2) { PG.clinicIdx++; PG.clinicDraft = CLINIC[PG.clinicIdx].prompt; }
    else { PG.phase = "t1"; PG.draft = ""; emit("task_start", { taskId: "pg-t1", round: 1 }); PG.taskStart = Date.now(); }
    renderPG(); };
  const pf = $("pgfield");
  if (pf) { const upd = () => { PG.draft = pf.value; const n = $("wcnum"); if (n) n.textContent = words(pf.value); };
    pf.oninput = upd; upd();
    pf.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const b = $("pgsubmit"); if (b && !b.disabled) b.click(); } };
    if (!PG.busy) pf.focus(); }
  document.querySelectorAll("[data-word]").forEach((b) => b.onclick = () => {
    const f = $("pgfield"); if (!f) return; f.value = (f.value.trim() + " " + b.dataset.word).trim();
    f.dispatchEvent(new Event("input")); f.focus(); });
  const ph = $("pghelp"); if (ph) ph.onclick = () => { const t = TARGETS.find((x) => x.id === PG.phase);
    const f = $("pgfield"); f.value = t.example; f.dispatchEvent(new Event("input")); f.focus();
    emit("support_used", { kind: "worked_example", taskId: "pg-" + t.id }); };
  const ps = $("pgsubmit"); if (ps) ps.onclick = () => pgSubmitPrompt(TARGETS.find((t) => t.id === PG.phase));
  const pn = $("pgnext"); if (pn) pn.onclick = () => { PG.draft = "";
    if (PG.phase === "t1") { PG.phase = "t2"; emit("task_start", { taskId: "pg-t2", round: 2 }); PG.taskStart = Date.now(); }
    else if (PG.phase === "t2") { PG.phase = "comparison"; emit("comparison_shown", { itemA: PG.best.t1 && PG.best.t1.text, itemB: PG.best.t2 && PG.best.t2.text }); }
    else if (PG.phase === "t3") {
      phaseComplete(pgHighestStep());
      phaseStart("pg-low", "low", []);
      PG.phase = "t4"; emit("task_start", { taskId: "pg-t4", round: 4 }); PG.taskStart = Date.now(); }
    else { phaseComplete(pgHighestStep()); PG.phase = "close"; emit("session_end", { reason: "complete" }); }
    renderPG(); };
  const cm = $("cmpsubmit"); if (cm) cm.onclick = () => { const v = $("cmpfield").value.trim(); if (!v) { $("cmpfield").focus(); return; }
    PG.comparison = v; emit("comparison_response", { text: v, verbatim: v, code: null }); PG.draft = ""; PG.phase = "t3";
    emit("task_start", { taskId: "pg-t3", round: 3 }); PG.taskStart = Date.now(); renderPG(); };
  const pr = $("pgrestart"); if (pr) pr.onclick = () => { Object.assign(PG, { phase: "clinic", clinicIdx: 0, clinicDraft: CLINIC[0].prompt,
    draft: "", attempts: {}, best: {}, last: {}, comparison: "", taskStart: Date.now(), busy: false }); renderPG(); };
  const bh = $("backhub"); if (bh) bh.onclick = () => go("hub");
}

/* ============================ tool 3 · two machines ============================ */
/* Whole-class projector demo. One instruction, five runs, two executors.
   The literal half is a deterministic stand-in and never a model call — its
   reproducibility is the control condition the model half is measured against. */
const TM_TASK = {
  title: "Instructions for drawing a monster",
  vagueSeed: "draw a monster",
  preciseSeed: "draw a monster in exactly 4 numbered steps, each step saying one body part and how many of it",
  precisePlaceholder: "The class fixes it here — say how many steps, and what each step has to contain…",
  parts: ["eye","leg","arm","horn","tooth","teeth","tail","wing","ear","head","claw","spike","tentacle",
    "nose","mouth","finger","toe","antenna","antennae","fang","scale","spot","eyeball","nostril","tongue"],
};
const TM_PARTS = ["eyes", "legs", "horns", "teeth", "arms", "tails"];
/* Applied identically to BOTH machines and shown on screen, so the halves stay
   parallel and nothing is hidden. Without it the model writes paragraphs that
   nobody at the back of the room reads. */
const TM_SUFFIX = "Keep the whole answer under 40 words.";
const TM_COUNTS = [3, 5, 2, 9, 4, 1];
/* Pre-recorded genuine model runs, played when the network is down. Labelled on screen. */
const TM_TAPE = {
  vague: [
    "Start with a big oval, then add whatever feels scary. There are no wrong answers!",
    "1. Draw a shape.\n2. Add eyes.\n3. Add a mouth.\n4. Add arms.\n5. Add legs.\n6. Colour it in.",
    "First decide: friendly or fearsome? Then sketch a silhouette and build outward.",
    "Draw a circle. Put two eyes in it. Give it teeth. Done!",
    "Think of an animal you know, then exaggerate one feature until it looks strange."],
  precise: [
    "1. Draw 3 eyes.\n2. Draw 6 legs.\n3. Draw 2 horns.\n4. Draw 12 teeth.",
    "1. Draw 1 head.\n2. Draw 4 arms.\n3. Draw 8 eyes.\n4. Draw 2 tails.",
    "1. Draw 5 eyes.\n2. Draw 2 wings.\n3. Draw 7 spikes.\n4. Draw 3 mouths.",
    "Sure! Here you go:\n1. Draw 2 heads.\n2. Draw 9 fingers.\n3. Draw 1 horn.\n4. Draw 6 teeth.",
    "1. Draw 4 ears.\n2. Draw 3 legs.\n3. Draw 10 spots.\n4. Draw 1 nose."],
};
const TM = { executor: "literal", which: "vague", vague: TM_TASK.vagueSeed, precise: "",
  runs: [], running: false, ctl: null, speed: 850, log: [], prevSteps: {}, N: 5, reveal: 0 };
const tmText = () => (TM.which === "vague" ? TM.vague : TM.precise).trim();
const tmQuadrant = () => TM.executor + "-" + TM.which;

/* The literal executor. Wooden, deterministic, cheerful. Never says what you forgot. */
function tmLiteral(instruction) {
  const t = instruction.toLowerCase();
  const NUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  let n = null, at = Infinity;
  const dm = t.match(/\b(\d+)\b/); if (dm) { n = +dm[1]; at = dm.index; }
  for (const w in NUM) { const m = t.match(new RegExp("\\b" + w + "\\b")); if (m && m.index < at) { n = NUM[w]; at = m.index; } }
  const wantsSteps = /\bsteps?\b|\bnumbered\b|\blines?\b|\blist\b/.test(t);
  const wantsParts = /\bbody part|\bparts?\b|\bfeature/.test(t);
  const wantsCount = /how many|how much|number of|\bcount\b|quantity/.test(t);
  if (!wantsSteps) {
    // Nobody said how many steps, so it writes exactly one: the whole job,
    // undecomposed. Reads as an attempt rather than a glitch, and the failure
    // is legible in a glance next to the four-step version.
    const m = instruction.match(/^\s*(?:tell|show|teach|explain to|describe to)\s+\w+\s+(?:how to\s+)?(.+?)[.!?]?\s*$/i);
    const job = (m ? m[1] : instruction.replace(/^\s*please\s+/i, "").replace(/[.!?]\s*$/, "")).trim();
    return "1. " + cap(job) + ".";
  }
  const k = Math.max(1, Math.min(9, n || 3));
  const out = [];
  for (let i = 0; i < k; i++) {
    const part = wantsParts ? TM_PARTS[i % TM_PARTS.length] : "a shape";
    const num = wantsCount ? TM_COUNTS[i % TM_COUNTS.length] + " " : "";
    out.push((i + 1) + ". Draw " + num + part + ".");
  }
  return out.join("\n");
}
/* The same deterministic checker runs on BOTH halves. That is what makes the
   two columns comparable — only the executor differs. */
function tmCheck(out) {
  const all = String(out || "").split("\n").map((x) => x.trim()).filter(Boolean);
  // A step is a line with a number in it. A preamble like "Sure! Here you go:"
  // has no number, so it is chatter and does not count against the instruction —
  // the steps are there, and marking a correct answer wrong would teach students
  // to distrust the checker.
  const isStep = (l) => /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(l);
  const steps = all.filter(isStep);
  const chatter = all.length - steps.length;
  const named = steps.length > 0 && steps.every((l) => TM_TASK.parts.some((w) => new RegExp("\\b" + w + "s?\\b", "i").test(l)));
  const four = steps.length === 4;
  return { pass: four && named, four, named, steps: steps.length, chatter, lines: all.length };
}
function tmRevision(text) {
  const prev = TM.prevSteps[TM.which];
  const cur = text.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!prev) return "first";
  if (prev.length === cur.length && prev.every((x, i) => x === cur[i])) return "reworded_only";
  if (prev.length === cur.length && [...prev].sort().join("|") === [...cur].sort().join("|")) return "reordered";
  if (cur.length > prev.length) { let j = 0; for (const l of cur) if (l === prev[j]) j++; if (j === prev.length) return "added_step"; }
  return "rewritten";
}
async function tmRun() {
  if (TM.running) return;
  const text = tmText(); if (!text) return;
  const quadrant = tmQuadrant(), instructionId = quadrant + "-" + hash(text).toString(36);
  const revisionType = tmRevision(text);
  TM.prevSteps[TM.which] = text.split("\n").map((x) => x.trim()).filter(Boolean);
  TM.runs = Array.from({ length: TM.N }, () => ({ out: null }));
  TM.running = true; TM.ctl = new AbortController(); TM.reveal = 0;
  emit("task_start", { taskId: "tm-" + quadrant, round: 1, wholeClass: true });
  emit("instruction_submitted", { text, stepCount: TM.prevSteps[TM.which].length, revisionType, quadrant });
  renderTM();
  for (let i = 0; i < TM.N; i++) {
    if (!TM.running) break;
    let out = null, src = "literal";
    if (TM.executor === "literal") { out = tmLiteral(text); await new Promise((r) => setTimeout(r, TM.speed)); }
    else {
      try { out = await ask(text + "\n\n" + TM_SUFFIX, { signal: TM.ctl.signal }); } catch (e) { break; }
      if (out == null) { out = TM_TAPE[TM.which === "vague" ? "vague" : "precise"][i % 5]; src = "recording"; }
      else src = "live";
    }
    if (!TM.running) break;
    const first = TM.runs[0].out;
    const same = i > 0 && first != null && out.trim() === first.trim();
    TM.runs[i] = { out, src, same, check: tmCheck(out) };
    emit("run_executed", { instructionId, runIndex: i + 1, output: out.slice(0, 60), sameAsRun1: i === 0 ? null : same, quadrant });
    TM.reveal = i + 1; renderTM();
  }
  const done = TM.runs.filter((r) => r.out);
  const uniq = new Set(done.map((r) => r.out.trim()));
  TM.log.push({ text: text.replace(/\n/g, " / "), quadrant, outcome: "",
    revisionType, runs: done.length, distinct: uniq.size });
  emit("task_complete", { taskId: "tm-" + quadrant, attemptCount: done.length, distinctOutputs: uniq.size, wholeClass: true });
  TM.running = false; renderTM();
}
/* Draw what the output describes. Deterministic: the same output always draws
   the same monster, so the literal machine's five identical answers produce
   five identical monsters and the model's five different answers produce five
   different ones. The variance becomes something you can see from the back of
   the room rather than something you read. */
const MPARTS = { eye: 2, eyes: 2, eyeball: 2, eyeballs: 2, leg: 2, legs: 2, arm: 2, arms: 2,
  horn: 2, horns: 2, tooth: 4, teeth: 4, tail: 1, tails: 1, wing: 2, wings: 2, ear: 2, ears: 2,
  head: 1, heads: 1, spike: 3, spikes: 3, spot: 4, spots: 4, nose: 1, noses: 1, mouth: 1,
  mouths: 1, antenna: 2, antennae: 2, claw: 2, claws: 2, finger: 3, fingers: 3, toe: 3, toes: 3,
  tentacle: 3, tentacles: 3, fang: 2, fangs: 2, scale: 5, scales: 5, tongue: 1, nostril: 2, nostrils: 2 };
const NUMW2 = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12 };
function parseMonster(text) {
  const found = {};
  for (const line of String(text || "").split("\n")) {
    const re = /(?:\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)?\b([a-z]+)\b/gi;
    let m;
    while ((m = re.exec(line))) {
      const part = m[2].toLowerCase();
      if (!(part in MPARTS)) continue;
      const raw = m[1] ? (NUMW2[m[1].toLowerCase()] ?? parseInt(m[1], 10)) : MPARTS[part];
      if (!(part in found)) found[part] = Math.max(0, Math.min(12, raw || MPARTS[part]));
    }
  }
  return found;
}
function monsterSVG(text) {
  const f = parseMonster(text);
  const get = (...names) => { for (const n of names) if (n in f) return f[n]; return 0; };
  const P = [];
  const spread = (n, y, fn) => { for (let i = 0; i < n; i++) fn(n === 1 ? 100 : 62 + (i * 76) / (n - 1), y, i); };
  const body = `<ellipse cx="100" cy="98" rx="46" ry="40" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.5"/>`;
  // horns / spikes / antennae on top
  const horns = get("horn", "horns"), spikes = get("spike", "spikes"), ant = get("antenna", "antennae");
  spread(horns, 0, (x) => P.push(`<polygon points="${x - 7},60 ${x},34 ${x + 7},60" fill="var(--amber)"/>`));
  spread(spikes, 0, (x) => P.push(`<polygon points="${x - 5},62 ${x},44 ${x + 5},62" fill="var(--fail)"/>`));
  spread(ant, 0, (x) => P.push(`<line x1="${x}" y1="60" x2="${x}" y2="32" stroke="var(--ink)" stroke-width="2"/><circle cx="${x}" cy="29" r="4" fill="var(--ink)"/>`));
  // extra heads
  spread(Math.max(0, get("head", "heads") - 1), 0, (x) => P.push(`<circle cx="${x}" cy="48" r="15" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>`));
  // ears / wings at the sides
  const ears = get("ear", "ears"), wings = get("wing", "wings");
  for (let i = 0; i < ears; i++) { const L = i % 2 === 0; P.push(`<ellipse cx="${L ? 52 : 148}" cy="${78 + Math.floor(i / 2) * 16}" rx="9" ry="13" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>`); }
  for (let i = 0; i < wings; i++) { const L = i % 2 === 0; const o = Math.floor(i / 2) * 10;
    P.push(`<polygon points="${L ? 56 : 144},${88 + o} ${L ? 14 : 186},${70 + o} ${L ? 20 : 180},${106 + o}" fill="var(--accent)" opacity=".35"/>`); }
  // spots / scales on the body
  const spots = get("spot", "spots") + get("scale", "scales");
  for (let i = 0; i < spots; i++) P.push(`<circle cx="${76 + ((i * 29) % 50)}" cy="${84 + ((i * 17) % 34)}" r="4.5" fill="var(--accent)" opacity=".4"/>`);
  // eyes
  const eyes = get("eye", "eyes", "eyeball", "eyeballs");
  spread(eyes, 0, (x, _y, i) => { const cy = eyes > 5 && i % 2 ? 94 : 84;
    P.push(`<circle cx="${x}" cy="${cy}" r="8" fill="#fff" stroke="var(--ink)" stroke-width="1.5"/><circle cx="${x}" cy="${cy + 1}" r="3.5" fill="var(--ink)"/>`); });
  // nose
  if (get("nose", "noses", "nostril", "nostrils")) P.push(`<circle cx="100" cy="104" r="4" fill="var(--ink)" opacity=".6"/>`);
  // mouth + teeth / fangs
  const teeth = get("tooth", "teeth") + get("fang", "fangs");
  if (teeth || get("mouth", "mouths") || get("tongue")) {
    P.push(`<path d="M74 114 Q100 132 126 114" fill="none" stroke="var(--ink)" stroke-width="2.5"/>`);
    for (let i = 0; i < teeth; i++) { const x = 78 + (i * 44) / Math.max(1, teeth - 1 || 1);
      P.push(`<polygon points="${x - 3},116 ${x},124 ${x + 3},116" fill="#fff" stroke="var(--ink)" stroke-width="1"/>`); }
    if (get("tongue")) P.push(`<path d="M94 122 Q100 136 106 122" fill="var(--fail)"/>`);
  }
  // limbs
  const legs = get("leg", "legs"), arms = get("arm", "arms"), tent = get("tentacle", "tentacles");
  spread(legs, 0, (x) => P.push(`<line x1="${x}" y1="134" x2="${x}" y2="158" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`));
  for (let i = 0; i < arms; i++) { const L = i % 2 === 0, o = Math.floor(i / 2) * 12;
    P.push(`<line x1="${L ? 56 : 144}" y1="${100 + o}" x2="${L ? 26 : 174}" y2="${88 + o}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`); }
  for (let i = 0; i < tent; i++) { const x = 70 + i * 16;
    P.push(`<path d="M${x} 134 q6 14 -4 24" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`); }
  // tail
  if (get("tail", "tails")) P.push(`<path d="M144 118 q34 8 20 32" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`);
  const empty = !Object.keys(f).length;
  return `<svg class="mon" viewBox="0 0 200 170" role="img" aria-label="monster drawn from the instructions">
    ${body}${P.join("")}
    ${empty ? `<text x="100" y="106" text-anchor="middle" font-family="var(--mono)" font-size="13" fill="var(--muted)">no features given</text>` : ""}
  </svg>`;
}
/* Which of the two readings of "draw" did this run take? The refusal branch is
   the interesting one: it read "draw" as make a picture, found that it could
   not, and said so. Same instruction, different question answered. */
function readingOf(out) {
  const t = String(out || "");
  const cannot = /\b(cannot|can ?not|can't|cant|unable|not able|don't have|no ability|text[- ]based|as an? (ai|text|language model))\b/i.test(t);
  const visual = /\b(image|images|picture|pictures|draw|drawing|visual|visuals|art|artwork|render)\b/i.test(t);
  if (cannot && visual) return "picture";
  if (/^\s*\d+[.)]/m.test(t)) return "steps";
  return "description";
}
const READING_NOTE = {
  picture: "read \u201cdraw\u201d as MAKE A PICTURE \u2014 then said it could not",
  steps: "read \u201cdraw\u201d as WRITE INSTRUCTIONS",
  description: "read \u201cdraw\u201d as DESCRIBE IT",
};
function renderTM() {
  const done = TM.runs.filter((r) => r.out);
  const uniq = new Set(done.map((r) => r.out.trim()));
  const interpreted = done.filter((r) => r.src !== "literal");
  const readingKinds = [...new Set(interpreted.map((r) => readingOf(r.out)))];
  const showReadings = readingKinds.length > 1;
  const cellState = (ex, wh) => {
    const row = [...TM.log].reverse().find((l) => l.quadrant === ex + "-" + wh);
    return row ? row.distinct + (row.distinct === 1 ? " answer" : " answers") : "not run";
  };
  const cellHtml = (ex, wh) => {
    const on = TM.executor === ex && TM.which === wh;
    const row = [...TM.log].reverse().find((l) => l.quadrant === ex + "-" + wh);
    return `<button class="qcell${on ? " on" : ""}${row ? " ran" : ""}" data-ex="${ex}" data-wh="${wh}">
      <span class="qv">${row ? (row.distinct === 1 ? "the same answer" : row.distinct + " different answers") : "not run yet"}</span>
      <span class="qs">${row ? "out of " + row.runs + " identical asks" : ""}</span></button>`;
  };
  const grid = `<div class="qgrid">
    <div></div><div class="qhead">Vague instruction</div><div class="qhead">Precise instruction</div>
    <div class="qside">Literal machine</div>${cellHtml("literal", "vague")}${cellHtml("literal", "precise")}
    <div class="qside">Real model</div>${cellHtml("model", "vague")}${cellHtml("model", "precise")}
  </div>`;
  $("stage").innerHTML = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="spread"><div><span class="eyebrow">Tool 3 · decomposition + stochastic reasoning</span><h1 style="font-size:24px;margin-top:2px">Two Machines</h1></div>
      <span class="eyebrow">projector demo · whole class</span></div>
    <p class="lede">One instruction, run <b>five times</b>, against two different machines. Nothing changes between the five runs — so anything different came from the machine, not from you.</p>
    <div class="how"><div><b>1</b>Vague, on the literal machine</div><div><b>2</b>Fix it</div><div><b>3</b>Vague, on the real model</div><div><b>4</b>Precise, on the real model</div></div>
  </section>

  <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
    <div class="spread"><span class="eyebrow">the four cells · tap one</span>
      <span class="hint">task: ${esc(TM_TASK.title)}</span></div>
    <p class="hint">Whatever the class decides to ask for, the tool does not judge whether the answer is
      <i>good</i> — you and the room do that out loud. What it counts is how many <b>different</b> answers came
      back from five identical asks. That number is the measurement, and it means the same thing whatever the task is.</p>
    ${grid}
  </section>

  <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
    <div class="row">
      <span class="eyebrow">machine</span>
      ${["literal", "model"].map((e) => `<button class="btn sm ${TM.executor === e ? "" : "ghost"}" data-ex2="${e}">${e === "literal" ? "Literal" : "Real model"}</button>`).join("")}
      <span class="chip" title="added to every run, both machines">+ “${esc(TM_SUFFIX)}”</span>
      <span class="hint">${TM.executor === "literal"
        ? "Deterministic. Same words in, same words out, every single time — that is the point of this column."
        : liveOn() ? "A real model, answer caching off, so a repeat really is a repeat." : "No live model here, so this plays five <b>pre-recorded</b> real runs. Labelled on each card."}</span>
    </div>
    <div class="tmins">
      <div class="${TM.which === "vague" ? "sel" : ""}">
        <div class="spread"><span class="eyebrow">the vague instruction · the class writes this</span>
          <button class="btn ghost sm" data-wh2="vague">${TM.which === "vague" ? "selected" : "use this"}</button></div>
        <textarea id="tmvague" rows="2" ${TM.running ? "disabled" : ""}>${esc(TM.vague)}</textarea>
      </div>
      <div class="${TM.which === "precise" ? "sel" : ""}">
        <div class="spread"><span class="eyebrow">the precise version · the class fixes it</span>
          <div class="row" style="gap:6px">
            <button class="btn ghost sm" data-wh2="precise">${TM.which === "precise" ? "selected" : "use this"}</button>
            ${TM.precise.trim() ? "" : `<button class="btn ghost sm" id="tmseed">fill in a suggestion</button>`}
          </div></div>
        <textarea id="tmprecise" rows="3" placeholder="${esc(TM_TASK.precisePlaceholder)}" ${TM.running ? "disabled" : ""}>${esc(TM.precise)}</textarea>
      </div>
    </div>
    <div class="row">
      <button class="btn" id="tmrun" ${TM.running || !tmText() ? "disabled" : ""}>${TM.running ? "Running " + TM.reveal + " of " + TM.N + "…" : "Run this " + TM.N + " times"}</button>
      <button class="btn ghost sm" id="tmstop" ${TM.running ? "" : "disabled"}>Stop</button>
      <label class="hint" style="display:flex;gap:6px;align-items:center">speed
        <select id="tmspeed" style="background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:2px 5px;font-family:var(--mono);font-size:11px">
          <option value="1400"${TM.speed == 1400 ? " selected" : ""}>slow</option>
          <option value="850"${TM.speed == 850 ? " selected" : ""}>steady</option>
          <option value="350"${TM.speed == 350 ? " selected" : ""}>quick</option></select></label>
      <span class="hint">running <b>${esc(tmQuadrant().replace("-", " · "))}</b></span>
    </div>
    ${TM.runs.length ? `<div class="runs">${TM.runs.map((r, i) => {
      if (!r.out) return `<div class="run waiting"><div class="n"><span>run ${i + 1}</span><span>…</span></div><div class="txt">waiting</div></div>`;
      const cls = i === 0 ? "same" : r.same ? "same" : "diff";
      return `<div class="run ${cls}">
        <div class="n"><span>run ${i + 1}${r.src === "recording" ? " · recording" : ""}</span><span>${i === 0 ? "first" : r.same ? "same as run 1" : "different"}</span></div>
        ${r.src === "literal" || !showReadings ? "" : `<div class="reading">${esc(READING_NOTE[readingOf(r.out)])}</div>`}
        ${Object.keys(parseMonster(r.out)).length ? monsterSVG(r.out) : ""}
        <div class="txt">${esc(r.out)}</div>
        </div>`;
    }).join("")}</div>` : ""}
    ${(() => { const k = {}; done.filter((r) => r.src !== "literal").forEach((r) => { const x = readingOf(r.out); k[x] = (k[x] || 0) + 1; });
      const kinds = Object.entries(k);
      return done.length >= 2 && kinds.length > 1
        ? `<div class="banner" style="border-left-color:var(--accent);background:var(--accent-soft)"><span>⚡</span><div>
            The five runs did not agree on <b>what you asked for</b>: ${kinds.map(([x, n]) => `${n} \u00d7 ${({picture: "tried to make a picture", steps: "wrote instructions", description: "wrote a description"})[x]}`).join(", ")}.
            “Draw” can mean make a picture or write instructions, and nothing in the instruction says which — so each run picked one.
            That is the variation being in the <b>question</b>, not just the wording.</div></div>`
        : ""; })()}
    ${done.length >= 2 ? `<div class="tally">
      <div><b>${done.length}</b><span>identical asks</span></div>
      <div><b style="color:${uniq.size > 1 ? "var(--accent)" : "var(--muted)"}">${uniq.size}</b><span>different answers</span></div>
      <div style="margin-left:auto;max-width:44ch"><p class="hint">${TM.executor === "literal"
        ? (uniq.size === 1 ? "Five identical asks, one answer. The machine did not change its mind — so whatever went wrong is in the <b>instruction</b>, not the machine." : "Unexpected: the literal machine should never vary. That is a bug.")
        : (uniq.size > 1 ? "Same words in, " + uniq.size + " different answers out. This machine does not have <i>one</i> answer to give you." : "All five came back identical this time — that happens on very constrained asks. Try the vague one.")}</p></div>
    </div>` : ""}
  </section>

  ${TM.log.length ? `
  <section class="card pad" style="display:flex;flex-direction:column;gap:10px">
    <span class="eyebrow">Facilitator log</span>
    <div class="scroller"><table class="ftable">
      <thead><tr><th>Instruction (verbatim)</th><th>Quadrant</th><th>Outcome (you judge)</th><th>Distinct</th><th>Revision type</th><th>Runs</th></tr></thead>
      <tbody>${TM.log.map((l, i) => `<tr>
        <td style="font-family:var(--mono);font-size:11.5px">${esc(l.text)}</td>
        <td style="font-family:var(--mono);font-size:11px">${esc(l.quadrant)}</td>
        <td><select data-tmout="${i}">${["—", "did what we wanted", "partly", "not what we wanted"].map((o) => `<option ${o === (l.outcome || "—") ? "selected" : ""}>${o}</option>`).join("")}</select></td>
        <td style="font-family:var(--mono)">${l.distinct}</td>
        <td><select data-tmrev="${i}">${["first","added_step","reordered","reworded_only","rewritten"].map((o) => `<option ${o === l.revisionType ? "selected" : ""}>${o}</option>`).join("")}</select></td>
        <td style="font-family:var(--mono)">${l.runs}</td></tr>`).join("")}</tbody></table></div>
    <p class="hint">The quadrant column is what makes decomposition and variance readable from the same table afterwards. Without it every attempt collapses into one undifferentiated list.</p>
    <div class="row"><button class="btn ghost" id="backhub">Back to hub</button></div>
  </section>` : ""}`;

  const v = $("tmvague"), pr = $("tmprecise");
  if (v) v.oninput = () => { TM.vague = v.value; const b = $("tmrun"); if (b) b.disabled = TM.running || !tmText(); };
  if (pr) pr.oninput = () => {
    TM.precise = pr.value;
    // Do NOT re-render here: replacing the textarea mid-keystroke loses focus
    // and the caret, which is why only one character at a time would land.
    const on = !!pr.value.trim();
    document.querySelectorAll('[data-wh2="precise"]').forEach((b) => b.disabled = !on);
    document.querySelectorAll('[data-wh="precise"]').forEach((b) => b.disabled = !on);
    const run = $("tmrun"); if (run) run.disabled = TM.running || !tmText();
  };
  document.querySelectorAll("[data-ex2]").forEach((b) => b.onclick = () => {
    if (TM.running || TM.executor === b.dataset.ex2) return;
    emit("quadrant_switched", { from: tmQuadrant(), to: b.dataset.ex2 + "-" + TM.which });
    TM.executor = b.dataset.ex2; TM.runs = []; renderTM(); });
  const seed = $("tmseed"); if (seed) seed.onclick = () => {
    TM.precise = TM_TASK.preciseSeed; TM.which = "precise"; TM.runs = []; renderTM(); };
  document.querySelectorAll("[data-wh2]").forEach((b) => b.onclick = () => {
    if (TM.running || TM.which === b.dataset.wh2) return;
    emit("quadrant_switched", { from: tmQuadrant(), to: TM.executor + "-" + b.dataset.wh2 });
    TM.which = b.dataset.wh2; TM.runs = []; renderTM(); });
  document.querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => {
    if (TM.running) return;
    const to = b.dataset.ex + "-" + b.dataset.wh;
    const needsText = b.dataset.wh === "precise" && !TM.precise.trim();
    if (to !== tmQuadrant()) emit("quadrant_switched", { from: tmQuadrant(), to });
    TM.executor = b.dataset.ex; TM.which = b.dataset.wh; TM.runs = []; renderTM();
    if (needsText) { const f = $("tmprecise"); if (f) f.focus(); } });
  $("tmrun").onclick = tmRun;
  $("tmstop").onclick = () => { TM.running = false; if (TM.ctl) TM.ctl.abort(); renderTM(); };
  $("tmspeed").onchange = (e) => { TM.speed = +e.target.value; };
  document.querySelectorAll("[data-tmrev]").forEach((s) => s.onchange = () => TM.log[+s.dataset.tmrev].revisionType = s.value);
  document.querySelectorAll("[data-tmout]").forEach((s) => s.onchange = () => {
    TM.log[+s.dataset.tmout].outcome = s.value === "\u2014" ? "" : s.value;
    emit("facilitator_judgement", { quadrant: TM.log[+s.dataset.tmout].quadrant, outcome: s.value }); });
  const bh = $("backhub"); if (bh) bh.onclick = () => go("hub");
}

/* ============================ hub ============================ */
const TOOLS = [
  { id: "ftr", name: "Find the Rule", day: 3, con: "hypothesis testing", built: true, blurb: "Build questions from pills, find the one hidden rule the partner is following, then commit and test it." },
  { id: "pg", name: "Prompt Golf", day: 3, con: "abstraction · debugging", built: true, blurb: "Hit the target in as few words as possible. Opens by fixing someone else's broken prompt." },
  { id: "tm", name: "Two Machines", day: 3, con: "decomposition · stochastic reasoning", built: true, tag: "projector", blurb: "One instruction, five runs, two machines. One never changes its mind; the other never stops." },
];
function renderHub() {
  $("stage").innerHTML = `
  <section class="card pad hubhead">
    <span class="eyebrow">CTx3 · one hub · one participant code</span>
    <h1>Pick your activity</h1>
    <p class="lede">Three tools, one session. Your code is entered once, here, and travels with everything you do — so nothing you produce today goes missing.</p>
  </section>
  <div class="tiles">${TOOLS.map((t) => { const live = t.day === S.day && t.built;
    return `<button class="tile${live ? "" : " off"}" data-tool="${t.id}" ${live ? "" : "disabled"}>
      ${t.tag ? `<span class="tag">${t.tag}</span>` : ""}<h3>${t.name}</h3><p>${t.blurb}</p>
      ${!t.built ? `<span class="ext">…/${t.id}?pc=${S.code}</span>` : ""}
      <span class="con">day ${t.day} · ${t.con}</span></button>`; }).join("")}</div>
  <section class="card pad" style="display:flex;flex-direction:column;gap:8px">
    <span class="eyebrow">Today's idea</span>
    <p class="lede">Day 3 is the day students find out that a language model is not a lookup table. ${liveOn()
      ? "A real model answers in <b>Prompt Golf</b> and in half of <b>Two Machines</b>, with answer caching switched off, so a repeat really is a repeat. <b>Find the Rule</b> and the literal half of <b>Two Machines</b> are deterministic on purpose — one so every student meets the same puzzle, the other so the class has a control condition to measure variance against."
      : "No live model is available in this view, so every tool is running on a deterministic stand-in and says so. The activities all work; what is missing is the variation, which on Day 3 is the point."}</p>
  </section>`;
  document.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => go(b.dataset.tool));
}
function renderCode() {
  $("stage").innerHTML = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:16px">
    <div><span class="eyebrow">Day ${S.day}</span><h1 style="font-size:27px;margin-top:3px">Enter your participant code</h1></div>
    <p class="lede">It is on the card you were given on day one. Three letters, then two numbers.</p>
    <div class="codewrap">
      <input class="codein" id="codefield" maxlength="5" placeholder="ABC12" autocomplete="off" spellcheck="false">
      <p class="hint" id="codemsg">No O or I, no 0, 1 or 5 — those get misread on a card.</p>
      <div class="row"><button class="btn" id="codego">Start</button></div>
      <hr class="hr">
      <div><span class="eyebrow" style="display:block;margin-bottom:6px">Demo roster</span><div class="roster">${ROSTER.slice(0, 5).map((c) => `<b>${c}</b>`).join("")}</div></div>
      <p class="hint">The code also decides which hidden rule this student gets in Find the Rule — same student, same rule, every session, and the class spread evenly across the set.</p>
    </div>
  </section>`;
  const f = $("codefield"); f.focus();
  f.oninput = () => { f.value = f.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  f.onkeydown = (e) => { if (e.key === "Enter") $("codego").click(); };
  $("codego").onclick = () => {
    const v = f.value.trim().toUpperCase(), msg = $("codemsg");
    if (!/^[A-HJ-NP-RT-Z]{3}[2-46-9]{2}$/.test(v)) { msg.textContent = "That is not the right shape. Three letters then two numbers — no O, I, S, 0, 1 or 5."; msg.style.color = "var(--fail)"; return; }
    if (!ROSTER.includes(v)) { msg.textContent = "We can't find that code. Check the card and try again."; msg.style.color = "var(--fail)"; return; }
    S.code = v; $("pcchip").textContent = v; save();
    window.__CTX3_CODE__ = v;
    startSession(v, S.deviceId, S.day);   // fire and forget; the UI never waits
    emit("session_start", { participantCode: v, tool: "hub", day: S.day, deviceId: S.deviceId, recorded: false });
    go("hub");
  };
}

/* ============================ routing + chrome ============================ */
function go(screen) {
  TM.running = false;
  if (S.screen !== "hub" && screen !== S.screen) emit("session_end", { reason: "navigated_away" });
  S.screen = screen;
  S.tool = { hub: "hub", code: "hub", ftr: "find-the-rule", pg: "prompt-golf", tm: "two-machines" }[screen] || "hub";
  window.scrollTo({ top: 0, behavior: "instant" });
  if (screen === "hub") renderHub();
  else if (screen === "code") renderCode();
  else if (screen === "ftr") { emit("session_start", { tool: "find-the-rule", day: S.day, deviceId: S.deviceId }); ftrStart(FTR.ruleId); }
  else if (screen === "pg") { emit("session_start", { tool: "prompt-golf", day: S.day, deviceId: S.deviceId });
    phaseStart("pg-high", "high", ["priorPromptsVisible", "wordCountLive", "targetChecklist"]);
    emit("task_start", { taskId: "pg-c1", round: 0 }); renderPG(); }
  // Whole-class: no participant code on this tool's rows, by design.
  else if (screen === "tm") { S.support = "na"; emit("session_start", { tool: "two-machines", day: S.day, deviceId: S.deviceId, wholeClass: true }); renderTM(); }
}
$("daypick").onchange = (e) => { S.day = +e.target.value; save(); if (S.screen === "hub") renderHub(); };
$("hubbtn").onclick = () => go("hub");
$("resetcode").onclick = () => go("code");
$("brand").onclick = () => { S.brandTaps++; if (S.brandTaps >= 5) { S.brandTaps = 0; showJSON(); } setTimeout(() => { S.brandTaps = 0; }, 2200); };
function showJSON() {
  const box = $("jsonbox"); box.hidden = false;
  box.value = exportJSON(S.code, S.day);
  box.scrollIntoView({ block: "center", behavior: "smooth" }); box.select();
  emit("support_used", { kind: "json_export" });
}
$("exportbtn").onclick = showJSON;
$("clearbtn").onclick = () => { S.events = []; S.seq = 0; S.lastAttempt = null;
  try { localStorage.removeItem(LS); } catch (e) {} clearBuffer(); $("jsonbox").hidden = true; renderRail(); };
$("offbtn").onclick = () => { S.forceOffline = !S.forceOffline;
  $("offsw").setAttribute("aria-pressed", String(S.forceOffline)); $("offbtn").setAttribute("aria-pressed", String(S.forceOffline));
  emit("support_used", { kind: "force_offline", on: S.forceOffline }); paintMode();
  if (S.screen !== "hub") go(S.screen); else renderHub(); };

function start(snap) {
  load();
  // Facilitator sets the day in the URL (?day=3); students never choose it.
  const qs = new URLSearchParams(location.search);
  const qd = parseInt(qs.get("day") || "", 10);
  if (qd >= 1 && qd <= 4) S.day = qd;
  // ?reset hands the device to the next student: nothing of the last one stays,
  // including anything they had queued but unsent.
  if (qs.has("reset")) {
    try { localStorage.removeItem(LS); } catch (e) {}
    clearBuffer();
    S.events = []; S.seq = 0; S.code = ""; S.screen = "code";
    history.replaceState(null, "", location.pathname + (qd >= 1 && qd <= 4 ? "?day=" + qd : ""));
  }
  if (snap && snap.screen) { S.screen = snap.screen; S.day = snap.day || S.day; S.code = snap.code || S.code; }
  $("daypick").value = String(S.day); $("pcchip").textContent = S.code;
  paintMode();
  if (!S.events.length) emit("session_start", { participantCode: S.code, tool: "hub", day: S.day, deviceId: S.deviceId, recorded: false });
  window.__CTX3_CODE__ = S.code;
  if (ROSTER.includes(S.code)) startSession(S.code, S.deviceId, S.day);
  renderRail(); go(S.code && ROSTER.includes(S.code) ? (S.screen === "code" ? "hub" : S.screen) : "code");
}
start({});

/* Last chance to get events out before the tab closes. */
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(true); });
addEventListener("pagehide", () => flushNow(true));
