import { log, flushNow, bufferedCount, exportJSON, clearBuffer, startSession, hasBackend } from "./lib/events.js";
import { askModel, modelAvailable } from "./lib/model.js";
import { ROSTER } from "./roster.js";

/* ============================ shared ============================ */
const LS = "d3station.v2";
const S = { code: "", first: "", initial: "", pinned: null, day: 3, screen: "hub", tool: "hub", events: [], seq: 0,
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
  const ev = { seq: ++S.seq, ts: nowISO(), tool: S.tool, deviceId: S.deviceId, type,
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
  if (S.screen === "w4w" || S.screen === "pg") go(S.screen);
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
  short_words: { level: 1, name: "Level 1b", tierWord: "lexical", label: "never uses a word longer than four letters",
    check: (t) => (t.match(/[a-z']+/gi) || []).every((w) => w.replace(/'/g, "").length <= 4),
    predicts: "every word is four letters or fewer",
    judge: /\b(four|4|short|small|tiny|brief)\b[^.!?]{0,26}\b(letters?|words?)\b|\bwords?\b[^.!?]{0,26}\b(short|small|four|4|tiny)\b/i,
    look: "Every answer feels oddly clipped, like it is being cut off. Look at the <b>words themselves</b>.",
    hints: ["Read one answer out loud. It sounds strange, but it is not about what it means.",
            "It is not how many words. It is something about each word on its own.",
            "Measure them. Not one of them gets past four letters."],
    say: {
      "in a few words": [(x) => x + ", of\u00a0course.", (x) => x + ", all day.",
        (x) => "Duh. " + x + ".", (x) => x + " and that is that."],
      "in one sentence": [(x) => x + ", and I will not back down on it.",
        (x) => x + " \u2014 not one of you can tell me I am wrong.",
        (x) => "For me it has to be " + x + ", each and every time."],
      "in a paragraph": [(x) => x + ", and I will not back down on it. My pals all say I am nuts. My pals are, in fact, the ones who are nuts.",
        (x) => x + " \u2014 not one of you can tell me I am wrong. I have had this take for ages and it has yet to fail me.",
        (x) => "It has to be " + x + ". I did try all of them. Not one of them came all that near."] } },

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
const RULE_ORDER = ["no_e", "short_words", "one_number", "colour"];
/* Same tier, run back to back: the first with the palette and the hypothesis
   field, the second without either. Difficulty held constant, support varied. */
const RULE_PAIRS = { lexical: ["no_e", "short_words"], categorical: ["one_number", "colour"] };

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
  "ice cream flavour": { any: ["cookie dough", "bubblegum", "butter pecan", "birthday cake"],
    noE: ["mint chip", "rocky road", "malt", "vanilla"], short: ["mint", "malt", "plum", "lime"] },
  "dog breed": { any: ["golden retriever", "chihuahua", "great dane", "shiba inu"],
    noE: ["corgi", "pug", "husky", "bulldog"], short: ["pug", "chow", "lab", "mutt"] },
  "male basketball player": { any: ["Steph Curry", "Nikola Jokic", "Luka Doncic", "Victor Wembanyama"],
    noE: ["Curry", "Jordan", "Luka", "Shaq"], short: ["Kidd", "Bird", "Rose", "Hill"] },
  "pizza topping": { any: ["hot honey", "pepperoni", "pineapple", "extra cheese"],
    noE: ["ham", "basil", "corn", "onion"], short: ["ham", "corn", "beef", "kale"] },
};
const HELD_OUT = [{ adj: "best", noun: "pizza topping", len: "in one sentence" },
  { adj: "weirdest", noun: "dog breed", len: "in a few words" },
  { adj: "most overrated", noun: "male basketball player", len: "in a paragraph" }];
const askText = (p) => "What's the " + p.adj + " " + p.noun + "? Answer " + p.len + ".";
const comboKey = (p) => p.adj + "|" + p.noun + "|" + p.len;

const FTR = { ruleId: "no_e", pair: "lexical", leg: 0, support: "high", freeText: "", phase: "probe", probes: [], pills: { adj: "best", noun: "ice cream flavour", len: "in a few words" },
  prevPills: null, hypo: "", hypoRev: 0, committed: "", taskStart: 0, asked: new Set(),
  revealed: false, matched: null, hints: 0, cases: null, confident: false };
const rule = () => RULES[FTR.ruleId];

/* A free-text probe still has to be answered. Read whatever nouns and
   adjectives it happens to contain, and fall back to the defaults — the
   student is hunting the RULE, not the topic, and the rule holds regardless. */
function inferPills(text) {
  const t = (text || "").toLowerCase();
  const noun = PILLS[1].opts.find((o) => t.includes(o.split(" ").pop())) || PILLS[1].opts[0];
  const adj = PILLS[0].opts.find((o) => t.includes(o.split(" ").pop())) || PILLS[0].opts[0];
  const len = /paragraph|detail|explain|why/.test(t) ? "in a paragraph"
    : /sentence|one line/.test(t) ? "in one sentence" : "in a few words";
  return { adj, noun, len };
}
function ftrAnswer(pills, contentFrom) {
  const r = rule(), sourcePills = contentFrom || pills;
  const bank = PICKS[sourcePills.noun][FTR.ruleId === "no_e" ? "noE" : FTR.ruleId === "short_words" ? "short" : "any"];
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
function ftrSendProbe(freeText) {
  if (FTR.probes.length >= 12) return;
  const low = !ftrHigh();
  const pills = low ? null : Object.assign({}, FTR.pills);
  const idx = FTR.probes.length, last = FTR.probes[idx - 1];
  const text = low ? String(freeText || "").trim() : askText(pills);
  if (!text) return;
  let singleFeature = null;
  if (pills && FTR.prevPills) singleFeature = PILLS.filter((sl) => pills[sl.key] !== FTR.prevPills[sl.key]).length === 1;
  const isRepeat = pills ? FTR.probes.some((x) => x.pills && comboKey(x.pills) === comboKey(pills))
    : FTR.probes.some((x) => x.text.trim().toLowerCase() === text.trim().toLowerCase());
  // In free text the partner answers whatever was asked, using the same rule
  // engine: the pills are inferred loosely so the bot still has something to
  // pick, but the RULE is what the student is hunting either way.
  const reply = ftrReply(pills || inferPills(text));
  FTR.probes.push({ text, pills, reply: reply.text, refuse: reply.refuse, at: Date.now() });
  if (pills) FTR.prevPills = pills;
  const d = attemptDerived("ftr-" + FTR.ruleId, text);
  /* A probe is disconfirming if it revisits a pill the student's standing
     hypothesis has already been formed around — cheap, exact under the palette,
     and recorded so the definition can be revised at rescore time. */
  const disconfirming = probeCouldDisconfirm(text, pills);
  FTR.probes[idx].disconfirming = disconfirming;
  emit("probe_sent", { text, probeIndex: idx, pills: pills ? comboKey(pills) : null,
    slotValues: pills ? { ...pills } : null, freeText: !pills,
    msSincePrevious: last ? Date.now() - last.at : null, msSinceTaskStart: Date.now() - FTR.taskStart,
    ...(singleFeature === null ? {} : { singleFeatureVariation: singleFeature }),
    repeatOfEarlierProbe: isRepeat, disconfirmingProbe: disconfirming,
    hypothesisStandingAtProbe: FTR.hypo || null, replyVerbatim: reply.text });
  emit("attempt_submitted", { attemptId: "p" + idx, taskId: "ftr-" + FTR.ruleId, artifact: text, ...d,
    probeIndex: idx, slotValues: pills ? { ...pills } : null, singleFeatureVariation: singleFeature,
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
function ftrStart(ruleId, support) {
  const cond = support || "high";
  Object.assign(FTR, { ruleId, support: cond, phase: "probe", probes: [], prevPills: null, hypo: "", hypoRev: 0,
    committed: "", locked: "", lockedAt: null, cases: null, taskStart: Date.now(), asked: new Set(),
    revealed: false, matched: null, hints: 0, confident: false, freeText: "" });
  /* High support: the slot palette and the always-visible hypothesis field.
     Low support: free text, and the guess is only captured at the two-stage
     commit. The hypothesis is STILL recorded either way \u2014 otherwise step 3
     is unreachable in the low condition and the range is manufactured. */
  phaseStart("ftr-" + ruleId, cond,
    cond === "high" ? ["slotPalette", "hypothesisField", "assembledPreview"] : []);
  emit("task_start", { taskId: "ftr-" + ruleId, round: RULES[ruleId].level, ruleId, supportCondition: cond });
  renderFTR();
}
const ftrHigh = () => FTR.support !== "low";

/* Does this probe re-test ground the student has already covered, while a
   hypothesis of theirs is standing? With the palette that is exact: one pill
   changed from some earlier probe, or none. In free text it is a token-overlap
   judgement and the attempt is flagged stepScoringExact:false for hand-coding. */
function probeCouldDisconfirm(text, pills) {
  if (!FTR.hypo && !FTR.locked) return false;
  if (!FTR.probes.length) return false;
  if (pills) {
    return FTR.probes.some((x) => x.pills &&
      PILLS.filter((sl) => x.pills[sl.key] !== pills[sl.key]).length <= 1);
  }
  const bag = (t) => new Set((t || "").toLowerCase().match(/[a-z]+/g) || []);
  const a = bag(text);
  if (a.size < 2) return false;
  return FTR.probes.some((x) => {
    const b = bag(x.text);
    let n = 0; for (const w of a) if (b.has(w)) n++;
    return n >= Math.max(2, Math.floor(Math.min(a.size, b.size) * 0.6));
  });
}

function renderFTR() {
  const used = FTR.probes.length, r = rule(), steps = ["probe", "commit", "close"];
  const changed = FTR.prevPills ? PILLS.filter((s) => FTR.pills[s.key] !== FTR.prevPills[s.key]).length : null;
  // Low-support probes are free text and carry no pills; guard every read.
  const dup = FTR.probes.some((x) => x.pills && comboKey(x.pills) === comboKey(FTR.pills));
  const head = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="spread">
      <div><span class="eyebrow">Tool 1 · hypothesis testing</span><h1 style="font-size:24px;margin-top:2px">Find the Rule</h1></div>
      <div class="steps">${steps.map((s) => `<span class="${FTR.phase === s ? "now" : steps.indexOf(s) < steps.indexOf(FTR.phase) ? "done" : ""}">${s}</span>`).join("")}</div>
    </div>
    <p class="lede">This chat partner is following one hidden rule. It will never tell you what the rule is — you have to work it out from what it says back.</p>
    <div class="how"><div><b>1</b>Build a question and send it</div><div><b>2</b>Spot what is always true</div><div><b>3</b>Write the rule down</div><div><b>4</b>Test it on 3 new questions</div></div>
    <div class="row">
      ${Object.keys(RULE_PAIRS).map((t) => `<button class="btn sm ${FTR.pair === t ? "" : "ghost"}" data-pair="${t}">${t}</button>`).join("")}
      <span class="chip">${ftrHigh() ? "with help" : "on your own"}</span>
      <span class="hint">Two rules of the same kind, back to back: the first with the question builder, the second without it. Same difficulty, different amount of help.</span>
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

  const composer = FTR.phase !== "probe" ? "" : !ftrHigh() ? `
    <section class="card pad" style="display:flex;flex-direction:column;gap:10px">
      <span class="eyebrow">Ask it anything \u00b7 your own words this time</span>
      <textarea id="freeprobe" rows="2" placeholder="Type a question and send it\u2026">${esc(FTR.freeText || "")}</textarea>
      <div class="row"><button class="btn" id="sendprobe" ${used >= 12 ? "disabled" : ""}>Send it</button>
        <span class="hint">No builder and no notes field this round. ${used} of 12 used.</span></div>
    </section>` : `
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
    </section>`;

  const hypo = FTR.phase === "probe" && ftrHigh() ? `
    <section class="card pad">
      <div class="hypo"><span class="eyebrow">I think it's…</span>
        <textarea id="hypofield" rows="2" placeholder="Optional. Change it as often as you like — every save is logged.">${esc(FTR.hypo)}</textarea>
        <div class="row"><button class="btn ghost sm" id="savehypo">Save this</button><span class="hint" id="hyposaved">${FTR.hypoRev ? "saved · revision " + FTR.hypoRev : "not saved yet"}</span></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn ghost" id="tocommit" ${used ? "" : "disabled"}>I'm ready to commit →</button>
      ${used >= 9 && !FTR.hypo ? `<span class="hint" style="color:var(--amber)">Nudge at question 9: nothing written down yet.</span>` : ""}</div>
    </section>` : "";

  const toCommitLow = FTR.phase === "probe" && !ftrHigh() ? `
    <section class="card pad"><div class="row">
      <button class="btn ghost" id="tocommit" ${used ? "" : "disabled"}>I'm ready to commit \u2192</button>
      <span class="hint">You write your answer down at the commit screen, then test it.</span>
    </div></section>` : "";

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
    const pairIds = RULE_PAIRS[FTR.pair] || [];
    const secondLegDue = ftrHigh() && pairIds[1] && pairIds[0] === FTR.ruleId;
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
      <div class="row">${secondLegDue
          ? `<button class="btn" data-next-leg="1">Next: a new rule, on your own →</button>`
          : `<button class="btn ghost" data-pair="${FTR.pair === "lexical" ? "categorical" : "lexical"}">Try the other kind →</button>`}
        <button class="btn ghost" id="backhub">Back to hub</button></div>
    </section>`;
  }
  $("stage").innerHTML = head + chat + composer + hypo + toCommitLow + commit + close;
  const c = $("chat"); if (c) c.scrollTop = c.scrollHeight;
  wireFTR();
}
function wireFTR() {
  document.querySelectorAll("[data-pair]").forEach((b) => b.onclick = () => {
    FTR.pair = b.dataset.pair; FTR.leg = 0; ftrStart(RULE_PAIRS[b.dataset.pair][0], "high"); });
  document.querySelectorAll("[data-next-leg]").forEach((b) => b.onclick = () => {
    FTR.leg = 1; ftrStart(RULE_PAIRS[FTR.pair][1], "low"); });
  document.querySelectorAll("[data-rule]").forEach((b) => b.onclick = () => ftrStart(b.dataset.rule, FTR.support));
  document.querySelectorAll(".slot").forEach((sl) => sl.querySelectorAll("button").forEach((b) => b.onclick = () => { FTR.pills[sl.dataset.slot] = b.dataset.opt; renderFTR(); }));
  const fp = $("freeprobe");
  if (fp) { fp.oninput = () => FTR.freeText = fp.value;
    fp.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("sendprobe").click(); } }; }
  const sp = $("sendprobe");
  if (sp) sp.onclick = () => { if (ftrHigh()) ftrSendProbe(); else { const v = ($("freeprobe").value || "").trim(); if (!v) return; FTR.freeText = ""; ftrSendProbe(v); } };
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
  wireBackHub();
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
  wireBackHub();
}

/* ============================ tool 3 · Word4Word ============================ */
/* Build a snowman by writing pseudocode. Three verbs, numbered lines, and a
   scene that renders one line at a time so the room watches a plan break at
   the exact step it breaks.

   This is the only place in the week that carries TEKS 8.1(A) — decompose a
   real-world problem into structured parts using pseudocode — which is why the
   task has a right answer and the failures have locations. */
const W4W_TASK = {
  title: "Build a snowman",
  vagueSeed: "build a snowman",
  preciseSeed: "1. ROLL a big ball\n2. ROLL a medium ball\n3. ROLL a small ball\n4. STACK the medium ball on the big ball\n5. STACK the small ball on the medium ball\n6. ADD a face to the small ball\n7. ADD arms to the medium ball",
  suffix: "Reply with numbered steps only, one per line. Keep it under 40 words.",
};
const SIZES = ["big", "medium", "small"];
/* Face and arms are the target. Hat, buttons and scarf are free decoration the
   checker ignores — which gives a real model somewhere harmless to vary, so
   five snowmen that all match but wear different hats reads as variance
   rather than as five different degrees of wrong. */
const FEATURES = ["face", "arms", "hat", "buttons", "scarf"];
const TARGET = { stack: ["big", "medium", "small"], face: "small", arms: "medium" };

/* Pre-recorded genuine model runs, played when the network is down. Labelled. */
const W4W_TAPE = {
  vague: [
    "1. Roll a large snowball for the base.\n2. Roll a medium ball and stack it on the base.\n3. Roll a small ball and stack it on top.\n4. Add a face to the small ball.\n5. Add stick arms to the middle.",
    "1. Make three snowballs.\n2. Put them on top of each other.\n3. Decorate it.",
    "1. Roll a big ball.\n2. Roll a medium ball.\n3. Roll a small ball.\n4. Stack the small on the medium.\n5. Stack the medium on the big.\n6. Add a face to the small ball.",
    "1. Roll a small ball.\n2. Roll a medium ball.\n3. Roll a big ball.\n4. Stack the medium on the small.\n5. Stack the big on the medium.\n6. Add a face and arms.",
    "1. Roll three balls of different sizes.\n2. Stack largest to smallest.\n3. Add a face to the top ball.\n4. Add arms to the middle ball.\n5. Add a hat.",
  ],
  precise: [
    "1. ROLL a big ball\n2. ROLL a medium ball\n3. ROLL a small ball\n4. STACK the medium ball on the big ball\n5. STACK the small ball on the medium ball\n6. ADD a face to the small ball\n7. ADD arms to the medium ball",
    "1. ROLL a big ball\n2. ROLL a medium ball\n3. ROLL a small ball\n4. STACK the medium ball on the big ball\n5. STACK the small ball on the medium ball\n6. ADD a face to the small ball\n7. ADD arms to the medium ball\n8. ADD a hat to the small ball",
    "1. ROLL a big ball\n2. ROLL a medium ball\n3. ROLL a small ball\n4. STACK the medium ball on the big ball\n5. STACK the small ball on the medium ball\n6. ADD arms to the medium ball\n7. ADD a face to the small ball",
    "1. ROLL a big ball\n2. ROLL a medium ball\n3. ROLL a small ball\n4. STACK the medium ball on the big ball\n5. STACK the small ball on the medium ball\n6. ADD a face to the small ball\n7. ADD arms to the medium ball\n8. ADD buttons to the big ball",
    "1. ROLL a big ball\n2. ROLL a medium ball\n3. ROLL a small ball\n4. STACK the medium ball on the big ball\n5. STACK the small ball on the medium ball\n6. ADD a face to the small ball\n7. ADD arms to the medium ball\n8. ADD a scarf to the medium ball",
  ],
};

/* ---- the scene -------------------------------------------------------- */
const freshScene = () => ({ rolled: [], stack: [], features: {}, floating: [] });

/* One line of pseudocode against the scene. Returns what happened, in the
   machine's own cheerful voice, plus whether it could act at all. */
/* "a face" but "arms" — the machine should not sound broken while being wooden. */
const art = (f) => (f === "arms" || f === "buttons" ? f : "a " + f);
function w4wStep(scene, line) {
  const t = String(line || "").replace(/^\s*\d+[.)]\s*/, "").trim().toLowerCase();
  const size = () => SIZES.find((z) => new RegExp("\\b" + z + "\\b").test(t))
    || (/\blarge\b|\bbiggest\b|\bbase\b/.test(t) ? "big" : /\bsmallest\b|\bhead\b|\btop\b/.test(t) ? "small" : null);

  if (/\broll\b|\bmake\b/.test(t)) {
    const count = (t.match(/\bthree\b|\b3\b/) ? 3 : 1);
    if (count === 3 && !size()) {
      // "roll three balls" — three balls, no sizes given, so three the same.
      scene.rolled.push("medium", "medium", "medium");
      return { ok: true, msg: "I rolled 3 balls. You did not say what size, so they are all the same." };
    }
    const z = size();
    if (!z) { scene.rolled.push("medium"); return { ok: true, msg: "I rolled a ball. You did not say what size." }; }
    scene.rolled.push(z);
    return { ok: true, msg: "I rolled a " + z + " ball." };
  }

  if (/\bstack\b|\bput\b|\bplace\b/.test(t)) {
    // Read the two balls in SENTENCE order, not list order. "the medium on the
    // big" means medium goes on top; taking them in size order would silently
    // invert every correct instruction a student writes.
    const m = t.match(/\b(big|medium|small|large|head|base)\b[\s\S]*?\bon\b[\s\S]*?\b(big|medium|small|large|head|base)\b/);
    if (!m) return { ok: false, msg: "Okay!" };      // "stack them up" names nothing
    const norm = (w) => ({ large: "big", base: "big", head: "small" }[w] || w);
    const top = norm(m[1]), bottom = norm(m[2]);
    const have = (z) => scene.rolled.includes(z) || scene.stack.includes(z);
    if (!have(top) || !have(bottom))
      return { ok: false, msg: "Okay!", missing: !have(top) ? top : bottom };
    if (!scene.stack.includes(bottom)) scene.stack.push(bottom);
    if (!scene.stack.includes(top)) scene.stack.push(top);
    return { ok: true, msg: "I put the " + top + " ball on the " + bottom + " ball." };
  }

  if (/\badd\b|\bgive\b|\bdecorate\b/.test(t)) {
    const feat = FEATURES.find((fe) => new RegExp("\\b" + fe + "\\b").test(t))
      || (/\beyes?\b|\bnose\b|\bcarrot\b|\bmouth\b/.test(t) ? "face" : /\bstick/.test(t) ? "arms" : null);
    if (!feat) return { ok: false, msg: "Okay!" };
    const z = size();
    if (!z) { scene.floating.push(feat); return { ok: true, msg: "I added " + art(feat) + ". You did not say which ball, so it is floating." }; }
    if (!scene.stack.includes(z)) { scene.floating.push(feat); return { ok: true, msg: "I added " + art(feat) + " where the " + z + " ball would be. There is no " + z + " ball up there yet." }; }
    scene.features[feat] = z;
    return { ok: true, msg: "I added " + art(feat) + " to the " + z + " ball." };
  }
  return { ok: false, msg: "Okay!" };
}

/* Run every line. Deterministic: same pseudocode in, same scene out. */
function w4wRun(text) {
  const scene = freshScene();
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const log = [];
  let firstDead = null;
  lines.forEach((line, i) => {
    const r = w4wStep(scene, line);
    if (!r.ok && firstDead === null) firstDead = i;
    log.push({ i, line, ...r });
  });
  return { scene, log, lines, firstDead };
}

/* Does the scene match the target? Named mismatches so the failure has a
   location the class can point at. */
function w4wCheck(scene) {
  const miss = [];
  const st = scene.stack;
  if (st.length !== 3) miss.push(st.length ? "only " + st.length + " ball" + (st.length === 1 ? "" : "s") + " stacked" : "nothing is stacked");
  else if (st.join(",") !== TARGET.stack.join(",")) miss.push("stacked " + st.join(" on ") + " — wrong way up");
  if (scene.features.face !== TARGET.face) miss.push(scene.features.face ? "face on the " + scene.features.face + " ball" : "no face on the head");
  if (scene.features.arms !== TARGET.arms) miss.push(scene.features.arms ? "arms on the " + scene.features.arms + " ball" : "no arms on the middle");
  if (scene.floating.length) miss.push(scene.floating.join(" and ") + " floating with nothing to attach to");
  return { matched: miss.length === 0, miss };
}

/* What did the model fill in that the class never said? This is the whole
   difference between the two machines, so it gets counted and shown. */
function w4wInferred(classText, modelText) {
  const said = String(classText || "").toLowerCase();
  const got = String(modelText || "").toLowerCase();
  const out = [];
  if (!SIZES.some((z) => said.includes(z)) && SIZES.some((z) => got.includes(z))) out.push("what size each ball is");
  if (!/\bon\b/.test(said) && /\bon\b/.test(got)) out.push("what goes on what");
  const saidWhere = FEATURES.some((f) => said.includes(f)) && SIZES.some((z) => said.includes(z));
  if (!saidWhere && FEATURES.some((f) => got.includes(f)) && SIZES.some((z) => got.includes(z))) out.push("which ball the face goes on");
  const saidSteps = /^\s*\d+[.)]/m.test(said);
  if (!saidSteps && /^\s*\d+[.)]/m.test(got)) out.push("that it should be numbered steps at all");
  return out;
}

/* ---- drawing ----------------------------------------------------------- */
const BALL_R = { big: 46, medium: 34, small: 24 };
function snowmanSVG(scene) {
  const P = [];
  const groundY = 178;
  // unstacked balls sit on the ground, left to right
  let x = 34;
  scene.rolled.filter((z) => !scene.stack.includes(z)).forEach((z) => {
    const r = BALL_R[z] || 30;
    P.push(`<circle cx="${x + r}" cy="${groundY - r}" r="${r}" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="2"/>`);
    x += r * 2 + 8;
  });
  // the tower
  let y = groundY;
  const centres = {};
  scene.stack.forEach((z) => {
    const r = BALL_R[z] || 30;
    y -= r;
    centres[z] = { cx: 150, cy: y, r };
    P.push(`<circle cx="150" cy="${y}" r="${r}" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/>`);
    y -= r - 4;
  });
  const at = (z) => centres[z];
  if (scene.features.face && at(scene.features.face)) {
    const c = at(scene.features.face);
    P.push(`<circle cx="${c.cx - 9}" cy="${c.cy - 5}" r="3" fill="var(--ink)"/><circle cx="${c.cx + 9}" cy="${c.cy - 5}" r="3" fill="var(--ink)"/>`);
    P.push(`<polygon points="${c.cx},${c.cy + 2} ${c.cx + 20},${c.cy + 6} ${c.cx},${c.cy + 9}" fill="var(--amber)"/>`);
    P.push(`<path d="M${c.cx - 9} ${c.cy + 13} q9 7 18 0" fill="none" stroke="var(--ink)" stroke-width="1.8"/>`);
  }
  if (scene.features.arms && at(scene.features.arms)) {
    const c = at(scene.features.arms);
    P.push(`<line x1="${c.cx - c.r}" y1="${c.cy}" x2="${c.cx - c.r - 28}" y2="${c.cy - 18}" stroke="var(--amber)" stroke-width="3" stroke-linecap="round"/>`);
    P.push(`<line x1="${c.cx + c.r}" y1="${c.cy}" x2="${c.cx + c.r + 28}" y2="${c.cy - 18}" stroke="var(--amber)" stroke-width="3" stroke-linecap="round"/>`);
  }
  if (scene.features.hat && at(scene.features.hat)) {
    const c = at(scene.features.hat);
    P.push(`<rect x="${c.cx - 26}" y="${c.cy - c.r - 5}" width="52" height="5" fill="var(--ink)"/><rect x="${c.cx - 15}" y="${c.cy - c.r - 26}" width="30" height="22" fill="var(--ink)"/>`);
  }
  if (scene.features.scarf && at(scene.features.scarf)) {
    const c = at(scene.features.scarf);
    P.push(`<rect x="${c.cx - c.r}" y="${c.cy - c.r - 2}" width="${c.r * 2}" height="8" fill="var(--fail)"/>`);
  }
  if (scene.features.buttons && at(scene.features.buttons)) {
    const c = at(scene.features.buttons);
    [-12, 2, 16].forEach((d) => P.push(`<circle cx="${c.cx}" cy="${c.cy + d}" r="3.5" fill="var(--ink)"/>`));
  }
  // anything with nothing to attach to hangs in the air, which is the point
  scene.floating.forEach((f, i) => {
    P.push(`<polygon points="212,${52 + i * 22} 234,${56 + i * 22} 212,${60 + i * 22}" fill="var(--amber)"/>`);
    P.push(`<text x="240" y="${62 + i * 22}" font-family="var(--mono)" font-size="10" fill="var(--fail)">${f}?</text>`);
  });
  const empty = !scene.rolled.length && !scene.stack.length && !scene.floating.length;
  return `<svg class="mon" viewBox="0 0 300 200" role="img" aria-label="the snowman these instructions built">
    <line x1="0" y1="${groundY}" x2="300" y2="${groundY}" stroke="var(--line-2)" stroke-width="1.5"/>
    ${P.join("")}
    ${empty ? `<text x="150" y="100" text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--muted)">nothing was built</text>` : ""}
  </svg>`;
}

/* ---- state -------------------------------------------------------------- */
const W4W = {
  mode: "solo",                 // solo = hands-on, class = the projector 2x2
  executor: "literal", which: "vague",
  vague: W4W_TASK.vagueSeed, precise: "",
  draft: W4W_TASK.vagueSeed,    // the student's own pseudocode
  runs: [], running: false, ctl: null, speed: 700, N: 5,
  log: [], attempts: [], prevLines: null, prevMatched: null,
  scene: freshScene(), stepLog: [], playing: false, timer: null, cursor: -1,
};
const w4wText = () => (W4W.which === "vague" ? W4W.vague : W4W.precise).trim();
const w4wQuadrant = () => W4W.executor + "-" + W4W.which;
const isNumbered = (t) => String(t || "").split("\n").filter((l) => l.trim()).every((l) => /^\s*\d+[.)]/.test(l));

function w4wRevision(lines) {
  const prev = W4W.prevLines;
  if (!prev) return "first";
  if (prev.length === lines.length && prev.every((x, i) => x === lines[i])) return "reworded_only";
  if (prev.length === lines.length && [...prev].sort().join("|") === [...lines].sort().join("|")) return "reordered";
  if (lines.length > prev.length) { let j = 0; for (const l of lines) if (l === prev[j]) j++; if (j === prev.length) return "added_step"; }
  if (prev.length === lines.length) return "reworded_only";
  return "rewritten";
}

/* ---- hands-on: one student, one instruction, played out a line at a time -- */
function w4wPlay() {
  if (W4W.playing) return;
  const text = $("w4wfield").value;
  const { lines } = w4wRun(text);
  if (!lines.length) return;
  W4W.scene = freshScene(); W4W.stepLog = []; W4W.cursor = -1; W4W.playing = true;
  const revisionType = w4wRevision(lines);
  W4W.prevLines = lines;
  const id = "w4w" + W4W.attempts.length;
  const d = attemptDerived("w4w-solo", text);
  emit("attempt_submitted", { attemptId: id, taskId: "w4w-solo", artifact: text.replace(/\n/g, " / "), ...d,
    stepCount: lines.length, numbered: isNumbered(text), revisionType });
  emit("instruction_submitted", { text: text.replace(/\n/g, " / "), stepCount: lines.length, revisionType,
    numbered: isNumbered(text), quadrant: "solo" });

  let i = 0;
  const beat = () => {
    if (i >= lines.length) {
      W4W.playing = false;
      const chk = w4wCheck(W4W.scene);
      const dead = W4W.stepLog.findIndex((x) => !x.ok);
      emit("instruction_executed", { matched: chk.matched, mismatch: chk.miss, failurePoint: dead < 0 ? null : dead, quadrant: "solo" });
      emit("attempt_evaluated", { attemptId: id, outcome: chk.matched ? "pass" : "fail", failureType: chk.matched ? null : "target_not_met",
        matched: chk.matched, prevMatched: W4W.prevMatched });
      W4W.attempts.push({ text: lines.join(" / "), revisionType, matched: chk.matched, miss: chk.miss, numbered: isNumbered(text) });
      W4W.prevMatched = chk.matched;
      renderW4W(); return;
    }
    W4W.cursor = i;
    W4W.stepLog.push({ i, ...w4wStep(W4W.scene, lines[i]) });
    emit("walkthrough_step", { stepIndex: i, line: lines[i], effect: W4W.stepLog[i].msg, quadrant: "solo" });
    i++; renderW4W();
    W4W.timer = setTimeout(beat, W4W.speed);
  };
  renderW4W(); W4W.timer = setTimeout(beat, 250);
}

/* ---- projector: five runs of one instruction against one machine --------- */
async function w4wRunFive() {
  if (W4W.running) return;
  const text = w4wText(); if (!text) return;
  const quadrant = w4wQuadrant(), instructionId = quadrant + "-" + hash(text).toString(36);
  W4W.runs = Array.from({ length: W4W.N }, () => ({ out: null }));
  W4W.running = true; W4W.ctl = new AbortController();
  // Projector rows are class-level: no participant attribution, by design.
  emit("instruction_submitted", { participantCode: null, text, stepCount: text.split("\n").filter(Boolean).length,
    revisionType: "class", numbered: isNumbered(text), quadrant });
  renderW4W();
  for (let k = 0; k < W4W.N; k++) {
    if (!W4W.running) break;
    let out = null, src = "literal";
    if (W4W.executor === "literal") { out = text; await new Promise((r) => setTimeout(r, 260)); }
    else {
      try { out = await ask(text + "\n\n" + W4W_TASK.suffix, { signal: W4W.ctl.signal }); } catch (e) { break; }
      if (out == null) { out = W4W_TAPE[W4W.which][k % 5]; src = "recording"; } else src = "live";
    }
    if (!W4W.running) break;
    const { scene } = w4wRun(out);
    const chk = w4wCheck(scene);
    const first = W4W.runs[0].out;
    W4W.runs[k] = { out, src, scene, chk, same: k > 0 && first != null && out.trim() === first.trim(),
      inferred: src === "literal" ? [] : w4wInferred(text, out) };
    emit("run_executed", { participantCode: null, instructionId, runIndex: k + 1, output: out.slice(0, 60),
      sameAsRun1: k === 0 ? null : W4W.runs[k].same, matched: chk.matched, inferredCount: W4W.runs[k].inferred.length, quadrant });
    renderW4W();
  }
  const done = W4W.runs.filter((r) => r.out);
  const uniq = new Set(done.map((r) => r.out.trim()));
  W4W.log.push({ text: text.replace(/\n/g, " / "), quadrant, runs: done.length, distinct: uniq.size,
    matched: done.filter((r) => r.chk.matched).length, outcome: "" });
  W4W.running = false; renderW4W();
}

/* ---- render -------------------------------------------------------------- */
function renderW4W() {
  const head = `
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="spread"><div><span class="eyebrow">Tool 3 · decomposition + stochastic reasoning</span>
      <h1 style="font-size:24px;margin-top:2px">Word4Word</h1></div>
      <span class="eyebrow">${W4W.mode === "solo" ? "your own build" : "projector · whole class"}</span></div>
    <p class="lede">Write the steps for building a snowman. The machine does <b>word for word</b> what you wrote, one line at a time — no more, and nothing you left out.</p>
    <div class="row">
      <button class="btn sm ${W4W.mode === "solo" ? "" : "ghost"}" data-w4wmode="solo">Build your own</button>
      <button class="btn sm ${W4W.mode === "class" ? "" : "ghost"}" data-w4wmode="class">The four cells</button>
      <span class="hint">${W4W.mode === "solo"
        ? "Your work here is saved against your code."
        : "Projector only. These runs are logged for the class, not for any one student."}</span>
    </div>
  </section>`;

  const palette = `
    <div>
      <span class="eyebrow">the only three things it understands · tap to add a line</span>
      <div class="chips" style="margin-top:6px">
        ${["ROLL a big ball", "ROLL a medium ball", "ROLL a small ball",
           "STACK the medium ball on the big ball", "STACK the small ball on the medium ball",
           "ADD a face to the small ball", "ADD arms to the medium ball",
           "ADD a hat to the small ball"].map((v) => `<button class="chip" data-w4wcmd="${esc(v)}">${esc(v)}</button>`).join("")}
      </div>
    </div>`;

  const goal = `
    <div class="goal">
      <span class="eyebrow">what you are building</span>
      <p><b>Three balls stacked biggest at the bottom, a face on the head, arms on the middle.</b></p>
      <p class="hint">A hat, buttons or a scarf are yours to add or leave out — they are not checked.</p>
    </div>`;

  let body = "";
  if (W4W.mode === "solo") {
    const chk = w4wCheck(W4W.scene);
    const last = W4W.attempts[W4W.attempts.length - 1];
    body = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      ${goal}
      <div class="scene">
        <div>${snowmanSVG(W4W.scene)}
          ${!W4W.playing && W4W.stepLog.length ? `<div class="${chk.matched ? "shrink" : "banner"}" style="margin-top:10px">
            ${chk.matched ? "<div><b>✓</b><span>it matches</span></div>" : `<span>✗</span><div>${esc(chk.miss.join("; "))}</div>`}</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
          ${palette}
          <span class="eyebrow">your steps · one per line, starting with a number</span>
          <textarea id="w4wfield" rows="8" style="font-family:var(--mono);font-size:13.5px" ${W4W.playing ? "disabled" : ""}>${esc(W4W.draft)}</textarea>
          <div class="row">
            <button class="btn" id="w4wrun" ${W4W.playing ? "disabled" : ""}>${W4W.playing ? "Building…" : "Build it"}</button>
            <button class="btn ghost sm" id="w4wstop" ${W4W.playing ? "" : "disabled"}>Stop</button>
            <label class="hint" style="display:flex;gap:6px;align-items:center">speed
              <select id="w4wspeed" style="background:var(--surface-2);border:1px solid var(--line);border-radius:2px;padding:2px 5px;font-family:var(--mono);font-size:11px">
                <option value="1200"${W4W.speed == 1200 ? " selected" : ""}>slow</option>
                <option value="700"${W4W.speed == 700 ? " selected" : ""}>steady</option>
                <option value="250"${W4W.speed == 250 ? " selected" : ""}>quick</option></select></label>
            ${last && !W4W.playing ? `<span class="hint">last try · ${last.matched ? "matched" : "missed"} · ${last.revisionType}</span>` : ""}
          </div>
          ${W4W.stepLog.length ? `<div><span class="eyebrow">what it did</span><div class="glog" style="margin-top:6px">${
            W4W.stepLog.map((l) => `<div class="${l.i === W4W.cursor && W4W.playing ? "now" : ""}"><span class="i">${l.i + 1}</span><span class="${l.ok ? "" : "noop"}">${esc(l.msg)}</span></div>`).join("")}</div></div>` : ""}
        </div>
      </div>
    </section>
    ${W4W.attempts.length ? `<section class="card pad" style="display:flex;flex-direction:column;gap:9px">
      <span class="eyebrow">your tries</span>
      <div class="scroller"><table class="ftable"><thead><tr><th>#</th><th>Steps (verbatim)</th><th>Numbered</th><th>Revision</th><th>Result</th></tr></thead><tbody>
        ${W4W.attempts.map((a, i) => `<tr><td style="font-family:var(--mono)">${i + 1}</td>
          <td style="font-family:var(--mono);font-size:11.5px">${esc(a.text)}</td>
          <td>${a.numbered ? "yes" : "no"}</td><td style="font-family:var(--mono);font-size:11px">${a.revisionType}</td>
          <td style="color:${a.matched ? "var(--pass)" : "var(--fail)"}">${a.matched ? "matched" : esc(a.miss[0] || "missed")}</td></tr>`).join("")}
      </tbody></table></div></section>` : ""}`;
  } else {
    const cell = (ex, wh) => {
      const row = [...W4W.log].reverse().find((l) => l.quadrant === ex + "-" + wh);
      const on = W4W.executor === ex && W4W.which === wh;
      return `<button class="qcell${on ? " on" : ""}${row ? " ran" : ""}" data-w4wex="${ex}" data-w4wwh="${wh}">
        <span class="qv">${row ? (row.distinct === 1 ? "the same answer" : row.distinct + " different answers") : "not run yet"}</span>
        <span class="qs">${row ? row.matched + " of " + row.runs + " built the snowman" : "·"}</span></button>`;
    };
    const done = W4W.runs.filter((r) => r.out);
    const uniq = new Set(done.map((r) => r.out.trim()));
    body = `
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      ${goal}
      <div class="qgrid">
        <div></div><div class="qhead">Vague instruction</div><div class="qhead">Precise instruction</div>
        <div class="qside">Word4Word</div>${cell("literal", "vague")}${cell("literal", "precise")}
        <div class="qside">Real model</div>${cell("model", "vague")}${cell("model", "precise")}
      </div>
    </section>
    <section class="card pad" style="display:flex;flex-direction:column;gap:14px">
      <div class="row"><span class="eyebrow">machine</span>
        ${["literal", "model"].map((e) => `<button class="btn sm ${W4W.executor === e ? "" : "ghost"}" data-w4wex2="${e}">${e === "literal" ? "Word4Word" : "Real model"}</button>`).join("")}
        <span class="hint">${W4W.executor === "literal"
          ? "Does exactly what the line says. Same words in, same snowman out, five times."
          : liveOn() ? "A real model, caching off, so a repeat really is a repeat." : "No live model here, so this plays five <b>pre-recorded</b> real runs, labelled on each card."}</span>
      </div>
      <div class="tmins">
        <div class="${W4W.which === "vague" ? "sel" : ""}">
          <div class="spread"><span class="eyebrow">the vague one · the class writes this</span>
            <button class="btn ghost sm" data-w4wwh2="vague">${W4W.which === "vague" ? "selected" : "use this"}</button></div>
          <textarea id="w4wvague" rows="3" ${W4W.running ? "disabled" : ""}>${esc(W4W.vague)}</textarea>
        </div>
        <div class="${W4W.which === "precise" ? "sel" : ""}">
          <div class="spread"><span class="eyebrow">the precise one · the class fixes it</span>
            <div class="row" style="gap:6px"><button class="btn ghost sm" data-w4wwh2="precise">${W4W.which === "precise" ? "selected" : "use this"}</button>
            ${W4W.precise.trim() ? "" : `<button class="btn ghost sm" id="w4wseed">fill in a suggestion</button>`}</div></div>
          <textarea id="w4wprecise" rows="3" placeholder="Numbered steps, one per line…" ${W4W.running ? "disabled" : ""}>${esc(W4W.precise)}</textarea>
        </div>
      </div>
      <div class="row">
        <button class="btn" id="w4wfive" ${W4W.running || !w4wText() ? "disabled" : ""}>${W4W.running ? "Running…" : "Run this " + W4W.N + " times"}</button>
        <button class="btn ghost sm" id="w4wstopfive" ${W4W.running ? "" : "disabled"}>Stop</button>
        <span class="hint">running <b>${esc(w4wQuadrant().replace("-", " · "))}</b></span>
      </div>
      ${W4W.runs.length ? `<div class="runs">${W4W.runs.map((r, i) => {
        if (!r.out) return `<div class="run waiting"><div class="n"><span>run ${i + 1}</span><span>…</span></div><div class="txt">waiting</div></div>`;
        return `<div class="run ${i === 0 || r.same ? "same" : "diff"}">
          <div class="n"><span>run ${i + 1}${r.src === "recording" ? " · recording" : ""}</span><span>${i === 0 ? "first" : r.same ? "same as run 1" : "different"}</span></div>
          ${snowmanSVG(r.scene)}
          ${r.inferred.length ? `<div class="reading">filled in ${r.inferred.length}: ${esc(r.inferred.join("; "))}</div>` : ""}
          <div class="txt" style="font-family:var(--mono);font-size:11.5px">${esc(r.out)}</div>
          <div class="qs2" style="color:${r.chk.matched ? "var(--pass)" : "var(--fail)"}">${r.chk.matched ? "✓ built the snowman" : "✗ " + esc(r.chk.miss[0])}</div></div>`;
      }).join("")}</div>` : ""}
      ${done.length >= 2 ? `<div class="tally">
        <div><b>${done.length}</b><span>identical asks</span></div>
        <div><b style="color:${uniq.size > 1 ? "var(--accent)" : "var(--muted)"}">${uniq.size}</b><span>different answers</span></div>
        <div><b style="color:${done.filter((r) => r.chk.matched).length === done.length ? "var(--pass)" : "var(--fail)"}">${done.filter((r) => r.chk.matched).length}</b><span>built the snowman</span></div>
        <div style="margin-left:auto;max-width:40ch"><p class="hint">${W4W.executor === "literal"
          ? "The same instruction gives the same snowman every time. So whatever is wrong is in the <b>instruction</b>."
          : done.some((r) => r.inferred.length)
            ? "This machine filled in steps nobody wrote. That is why it looks smarter — and why you cannot tell which parts were yours."
            : "Nothing left to fill in, so it varies only in the parts that do not matter."}</p></div>
      </div>` : ""}
    </section>
    ${W4W.log.length ? `<section class="card pad" style="display:flex;flex-direction:column;gap:10px">
      <span class="eyebrow">Facilitator log</span>
      <div class="scroller"><table class="ftable">
        <thead><tr><th>Instruction (verbatim)</th><th>Quadrant</th><th>Built it</th><th>Distinct</th><th>Outcome (you judge)</th></tr></thead>
        <tbody>${W4W.log.map((l, i) => `<tr><td style="font-family:var(--mono);font-size:11.5px">${esc(l.text)}</td>
          <td style="font-family:var(--mono);font-size:11px">${esc(l.quadrant)}</td>
          <td style="font-family:var(--mono)">${l.matched} / ${l.runs}</td>
          <td style="font-family:var(--mono)">${l.distinct}</td>
          <td><select data-w4wout="${i}">${["—", "did what we wanted", "partly", "not what we wanted"].map((o) => `<option ${o === (l.outcome || "—") ? "selected" : ""}>${o}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>
      <p class="hint">The quadrant column is what makes decomposition and variance readable from one table afterwards. <b>Built it</b> is the checker; <b>Outcome</b> is yours.</p>
    </section>` : ""}`;
  }

  $("stage").innerHTML = head + body + `<section class="card pad"><div class="row"><button class="btn ghost" id="backhub">Back to hub</button></div></section>`;
  wireW4W();
}

function wireW4W() {
  document.querySelectorAll("[data-w4wmode]").forEach((b) => b.onclick = () => {
    clearTimeout(W4W.timer); W4W.playing = false; W4W.running = false;
    W4W.mode = b.dataset.w4wmode;
    if (W4W.mode === "solo") phaseStart("w4w-solo", "na", ["verbPalette", "targetShown", "stepByStep"]);
    else { emit("quadrant_switched", { participantCode: null, from: "solo", to: w4wQuadrant() });
      phaseStart("w4w-class", "na", ["projector"]); }
    renderW4W(); });
  const f = $("w4wfield"); if (f) f.oninput = () => W4W.draft = f.value;
  document.querySelectorAll("[data-w4wcmd]").forEach((b) => b.onclick = () => {
    const fl = $("w4wfield"); if (!fl) return;
    const lines = fl.value.split("\n").filter((l) => l.trim());
    lines.push((lines.length + 1) + ". " + b.dataset.w4wcmd);
    fl.value = lines.join("\n"); W4W.draft = fl.value; fl.focus(); fl.scrollTop = fl.scrollHeight; });
  const run = $("w4wrun"); if (run) run.onclick = w4wPlay;
  const stop = $("w4wstop"); if (stop) stop.onclick = () => { clearTimeout(W4W.timer); W4W.playing = false; renderW4W(); };
  const sp = $("w4wspeed"); if (sp) sp.onchange = (e) => W4W.speed = +e.target.value;

  const v = $("w4wvague"); if (v) v.oninput = () => { W4W.vague = v.value; const b = $("w4wfive"); if (b) b.disabled = W4W.running || !w4wText(); };
  const pr = $("w4wprecise"); if (pr) pr.oninput = () => {
    W4W.precise = pr.value;
    document.querySelectorAll('[data-w4wwh2="precise"]').forEach((b) => b.disabled = false);
    const b = $("w4wfive"); if (b) b.disabled = W4W.running || !w4wText(); };
  const seed = $("w4wseed"); if (seed) seed.onclick = () => { W4W.precise = W4W_TASK.preciseSeed; W4W.which = "precise"; W4W.runs = []; renderW4W(); };
  document.querySelectorAll("[data-w4wex2]").forEach((b) => b.onclick = () => {
    if (W4W.running || W4W.executor === b.dataset.w4wex2) return;
    emit("quadrant_switched", { participantCode: null, from: w4wQuadrant(), to: b.dataset.w4wex2 + "-" + W4W.which });
    W4W.executor = b.dataset.w4wex2; W4W.runs = []; renderW4W(); });
  document.querySelectorAll("[data-w4wwh2]").forEach((b) => b.onclick = () => {
    if (W4W.running || W4W.which === b.dataset.w4wwh2) return;
    emit("quadrant_switched", { participantCode: null, from: w4wQuadrant(), to: W4W.executor + "-" + b.dataset.w4wwh2 });
    W4W.which = b.dataset.w4wwh2; W4W.runs = []; renderW4W(); });
  document.querySelectorAll("[data-w4wex]").forEach((b) => b.onclick = () => {
    if (W4W.running) return;
    W4W.executor = b.dataset.w4wex; W4W.which = b.dataset.w4wwh; W4W.runs = []; renderW4W();
    if (W4W.which === "precise" && !W4W.precise.trim()) { const fl = $("w4wprecise"); if (fl) fl.focus(); } });
  const five = $("w4wfive"); if (five) five.onclick = w4wRunFive;
  const stop5 = $("w4wstopfive"); if (stop5) stop5.onclick = () => { W4W.running = false; if (W4W.ctl) W4W.ctl.abort(); renderW4W(); };
  document.querySelectorAll("[data-w4wout]").forEach((s2) => s2.onchange = () => {
    W4W.log[+s2.dataset.w4wout].outcome = s2.value === "—" ? "" : s2.value;
    emit("facilitator_judgement", { participantCode: null, quadrant: W4W.log[+s2.dataset.w4wout].quadrant, outcome: s2.value }); });
  wireBackHub();
}

/* ============================ hub ============================ */
/* `path` is the tool's own URL segment. Each tool is reachable at
   /<path> as well as from the hub, so a facilitator can hand out one URL per
   station and a student on that URL never sees the other two. */
const TOOLS = [
  { id: "ftr", path: "find-the-rule", name: "Find the Rule", day: 3, con: "hypothesis testing", built: true, blurb: "Build questions from pills, find the one hidden rule the partner is following, then commit and test it." },
  { id: "pg", path: "prompt-golf", name: "Prompt Golf", day: 3, con: "abstraction · debugging", built: true, blurb: "Hit the target in as few words as possible. Opens by fixing someone else's broken prompt." },
  { id: "w4w", path: "word4word", name: "Word4Word", day: 2, con: "decomposition · pseudocode", built: true, tag: "day 2", blurb: "Write the steps to build a snowman. It does word for word what you wrote — no more, and nothing you left out." },
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
    <div><span class="eyebrow">Day ${S.day}</span><h1 style="font-size:27px;margin-top:3px">Sign in</h1></div>
    <p class="lede">Your code is on the card you were given on day one — three letters, then two numbers.</p>
    <div class="codewrap">
      <input class="codein" id="codefield" maxlength="5" placeholder="ABC12" autocomplete="off" spellcheck="false" aria-label="Participant code">
      <div class="namerow">
        <label><span class="eyebrow">First name</span>
          <input type="text" id="firstname" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Alex"></label>
        <label><span class="eyebrow">Last initial</span>
          <input type="text" id="lastinitial" maxlength="1" autocomplete="off" spellcheck="false" placeholder="R"></label>
      </div>
      <p class="hint" id="codemsg">No O or I, no 0, 1 or 5 in the code — those get misread on a card.</p>
      <div class="row"><button class="btn" id="codego">Start</button></div>
      <hr class="hr">
      <div><span class="eyebrow" style="display:block;margin-bottom:6px">Demo roster</span><div class="roster">${ROSTER.slice(0, 5).map((c) => `<b>${c}</b>`).join("")}</div></div>
      <p class="note">Your name is only here so a teacher can match this device to your paper packet. It is stored once, with your code, and appears nowhere in what you do afterwards.</p>
    </div>
  </section>`;
  const f = $("codefield"), fn = $("firstname"), li = $("lastinitial");
  f.focus();
  f.oninput = () => { f.value = f.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  li.oninput = () => { li.value = li.value.toUpperCase().replace(/[^A-Z]/g, ""); };
  const go1 = (e) => { if (e.key === "Enter") $("codego").click(); };
  f.onkeydown = go1; fn.onkeydown = go1; li.onkeydown = go1;
  $("codego").onclick = () => {
    const v = f.value.trim().toUpperCase(), msg = $("codemsg");
    const first = fn.value.trim(), initial = li.value.trim().toUpperCase();
    const fail = (t) => { msg.textContent = t; msg.style.color = "var(--fail)"; };
    if (!/^[A-HJ-NP-RT-Z]{3}[2-46-9]{2}$/.test(v))
      return fail("That code is not the right shape. Three letters then two numbers — no O, I, S, 0, 1 or 5.");
    if (!ROSTER.includes(v)) return fail("We can't find that code. Check the card and try again.");
    if (!first) { fn.focus(); return fail("We need your first name so your teacher can find your packet."); }
    if (!/^[A-Z]$/.test(initial)) { li.focus(); return fail("One letter for your last initial."); }

    S.code = v; S.first = first; S.initial = initial;
    $("pcchip").textContent = v; save();
    window.__CTX3_CODE__ = v;
    // Identifying fields go to the sessions row and nowhere else. They are
    // passed here as arguments rather than held in the event state, so there
    // is no path by which they reach an event payload.
    startSession(v, S.deviceId, S.day, { first_name: first, last_initial: initial });
    emit("session_start", { participantCode: v, tool: "hub", day: S.day, deviceId: S.deviceId, recorded: false });
    go(S.pinned || "hub");
  };
}

/* ============================ routing + chrome ============================ */

/**
 * Per-tool URLs.
 *
 * The hub at / still runs all three, which is what a one-device-per-student
 * classroom wants. But a station set up for one activity should not offer the
 * other two: /word4word signs the student in and drops them straight into
 * Word4Word, with no hub, no tiles and no way back out of it.
 *
 * Pinning is read from the path. `?tool=` is accepted as well because the
 * artifact build and any file:// copy have no server to rewrite paths, and a
 * demo that cannot be pinned is a demo of the wrong thing.
 */
const PATHS = Object.fromEntries(TOOLS.map((t) => [t.path, t.id]));
const IDS = new Set(TOOLS.map((t) => t.id));
function pinnedTool() {
  const seg = location.pathname.split("/").filter(Boolean).pop();
  if (seg && PATHS[seg]) return PATHS[seg];
  const q = (new URLSearchParams(location.search).get("tool") || "").trim();
  if (PATHS[q]) return PATHS[q];
  if (IDS.has(q)) return q;
  return null;
}
/* pushState throws on file:// and data: URLs, where there is no origin to push
   against. The demo runs on both, so every call is guarded. */
const canRoute = () => location.protocol === "http:" || location.protocol === "https:";

/* "Back to hub" is a lie on a pinned device -- there is no hub to go back to.
   The facilitator's hand-off control is Reset code, in the topbar. */
function wireBackHub() {
  const bh = $("backhub"); if (!bh) return;
  if (S.pinned) { bh.hidden = true; return; }
  bh.onclick = () => go("hub");
}

function go(screen, opts) {
  W4W.running = false; W4W.playing = false; clearTimeout(W4W.timer);
  // Leaving a TOOL is a session_end. Leaving the sign-in screen is not -- it
  // used to fire one at the same millisecond as the sign-in session_start,
  // which made every log open with an instant orphan close.
  const leavingTool = S.screen !== "hub" && S.screen !== "code";
  if (leavingTool && screen !== S.screen) emit("session_end", { reason: "navigated_away" });
  S.screen = screen;
  S.tool = { hub: "hub", code: "hub", ftr: "find-the-rule", pg: "prompt-golf", w4w: "word4word" }[screen] || "hub";
  window.scrollTo({ top: 0, behavior: "instant" });
  if (screen === "hub") renderHub();
  else if (screen === "code") renderCode();
  else if (screen === "ftr") { emit("session_start", { tool: "find-the-rule", day: S.day, deviceId: S.deviceId }); FTR.pair = "lexical"; FTR.leg = 0; ftrStart(RULE_PAIRS.lexical[0], "high"); }
  else if (screen === "pg") { emit("session_start", { tool: "prompt-golf", day: S.day, deviceId: S.deviceId });
    phaseStart("pg-high", "high", ["priorPromptsVisible", "wordCountLive", "targetChecklist"]);
    emit("task_start", { taskId: "pg-c1", round: 0 }); renderPG(); }
  // Whole-class: no participant code on this tool's rows, by design.
  else if (screen === "w4w") {
    S.support = "na";
    emit("session_start", { tool: "word4word", day: S.day, deviceId: S.deviceId });
    // Hands-on by default and attributed; the projector cells drop the code.
    phaseStart("w4w-solo", "na", ["verbPalette", "targetShown", "stepByStep"]);
    emit("task_start", { taskId: "w4w-solo", round: 1 });
    renderW4W(); }
  // Keep the address bar honest: the URL of a tool is the same URL a
  // facilitator would hand out for it. Not on a pinned device, where there is
  // nothing else for Back to reach.
  if (!S.pinned && !(opts && opts.fromPop) && canRoute()) {
    const t = TOOLS.find((x) => x.id === screen);
    const want = (t ? "/" + t.path : "/") + location.search;
    try { if (location.pathname + location.search !== want) history.pushState({ screen }, "", want); } catch (e) {}
  }
}
/* A student who hits Back should land on the hub, not on a broken page. */
window.addEventListener("popstate", () => {
  if (S.pinned || !ROSTER.includes(S.code)) return;
  const target = pinnedTool() || "hub";
  if (target !== S.screen) go(target, { fromPop: true });
});
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
  // Which tool this URL is pinned to, if any. Read once at boot and held in
  // state, because everything downstream -- the hub button, the back buttons,
  // where sign-in lands -- has to agree about it.
  S.pinned = pinnedTool();
  // A pinned URL carries its own day, so ?day= becomes optional on it.
  // "The facilitator opened /word4word but forgot ?day=2" is a study-day
  // failure that costs you the whole period's data, and it is cheaper to
  // design out than to remember. An explicit ?day= still overrides.
  if (S.pinned && !(qd >= 1 && qd <= 4)) S.day = TOOLS.find((t) => t.id === S.pinned).day;
  if (S.pinned) $("hubbtn").hidden = true;
  // ?reset hands the device to the next student: nothing of the last one stays,
  // including anything they had queued but unsent.
  if (qs.has("reset")) {
    try { localStorage.removeItem(LS); } catch (e) {}
    clearBuffer();
    S.events = []; S.seq = 0; S.code = ""; S.first = ""; S.initial = ""; S.screen = "code";
    // Keep the path and the ?tool= fallback -- the device is still this
    // station's device -- and drop everything else.
    const keep = new URLSearchParams();
    if (qd >= 1 && qd <= 4) keep.set("day", String(qd));
    if (qs.get("tool")) keep.set("tool", qs.get("tool"));
    const q = keep.toString();
    try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "")); } catch (e) {}
  }
  if (snap && snap.screen) { S.screen = snap.screen; S.day = snap.day || S.day; S.code = snap.code || S.code; }
  $("daypick").value = String(S.day); $("pcchip").textContent = S.code;
  paintMode();
  // Only for a device resuming with a code already on it. A fresh device has
  // no code yet, and emitting here would write a session_start with an empty
  // participantCode -- an orphan row with nothing to join it to.
  if (!S.events.length && ROSTER.includes(S.code))
    emit("session_start", { participantCode: S.code, tool: "hub", day: S.day, deviceId: S.deviceId, recorded: false });
  window.__CTX3_CODE__ = S.code;
  // The name is deliberately not persisted to localStorage, so a resumed
  // device re-registers with the code alone and the sessions row it already
  // wrote keeps the name from the first sign-in.
  if (ROSTER.includes(S.code)) startSession(S.code, S.deviceId, S.day);
  renderRail();
  // A pinned URL beats the restored screen: a device reloaded mid-period must
  // come back to the tool the station is for, not to wherever it happened to
  // be when the page last saved.
  if (!ROSTER.includes(S.code)) go("code");
  else go(S.pinned || (S.screen === "code" ? "hub" : S.screen));
}
start({});

/* Last chance to get events out before the tab closes. */
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(true); });
addEventListener("pagehide", () => flushNow(true));
