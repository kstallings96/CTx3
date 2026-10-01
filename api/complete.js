/**
 * /api/complete — the model proxy.
 *
 * The OpenRouter key cannot ship in the client bundle, so every model call
 * goes through here. The key lives in OPENROUTER_API_KEY, a plain Vercel
 * environment variable with NO `VITE_` prefix — anything VITE_-prefixed is
 * inlined into the bundle and would be public.
 *
 * Caching is off, deliberately and at every layer. Day 3 exists to show that
 * the same prompt does not give the same answer; a cache would quietly turn
 * that lesson into a lie.
 */
/* THE DEFAULT IS WHAT THE PILOT ACTUALLY RUNS ON, which it was not for a
   while: this said Haiku 4.5 while OPENROUTER_MODEL in the Vercel dashboard
   said gpt-4o-mini, so the number in the repo and the number answering
   students disagreed, and the first thing anybody checked was the wrong one.

   gpt-4o-mini because it was MEASURED, not assumed. Five AlwaysNever rules
   through the live endpoint, each with an automated check for whether the
   hidden rule actually held: 5/5, averaging 35 words. That is the bar that
   matters here -- a model that drops the rule on turn four does not make the
   activity cheaper, it makes a student who reasoned correctly from the
   evidence come out wrong.

   Cost is not the constraint either way. A whole five-day week is about 620
   calls: roughly SIX CENTS on this, about forty-five on Haiku 4.5. Pick on
   behaviour, not on price. Override with OPENROUTER_MODEL; DEPLOY.md lists
   the alternatives with current figures. */
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const MAX_PROMPT = 2000;
const MAX_TOKENS = 220;

/* A crude per-code limiter. Instance-local, so it is a guard against a stuck
   loop rather than a billing control — the real cap is the OpenRouter budget. */
const seen = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
function overLimit(code) {
  const now = Date.now();
  const hits = (seen.get(code) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  seen.set(code, hits);
  if (seen.size > 500) for (const [k, v] of seen) if (!v.some((t) => now - t < WINDOW_MS)) seen.delete(k);
  return hits.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    // Availability probe. Never reveals the key, only whether one is set.
    return res.status(200).json({ ok: Boolean(process.env.OPENROUTER_API_KEY), model: MODEL });
  }
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return res.status(200).json({ code: "not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const prompt = String(body?.prompt ?? "").slice(0, MAX_PROMPT);
  const code = String(body?.participantCode ?? "anon").slice(0, 16);
  if (!prompt.trim()) return res.status(400).json({ code: "empty_prompt" });
  if (overLimit(code)) return res.status(429).json({ code: "rate_limited" });

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_URL || "https://ctx3.vercel.app",
        "X-Title": "CTx3",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Explicitly 1, not left to the provider default. The variation
        // between identical calls IS the lesson, and a provider quietly
        // shipping a lower default would make the day's central claim look
        // false in front of the class.
        temperature: 1,
        // No system role: the artifact build reaches Claude through the
        // `sample` capability, which takes turns and has none. One prompt
        // shape for both backends means the demo and the deployed app cannot
        // drift -- and the prompt carries the safety framing, so it is not
        // something only one of them should get.
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.warn("[ctx3] openrouter", r.status, detail.slice(0, 200));
      return res.status(200).json({ code: r.status === 429 ? "rate_limited" : "upstream_error" });
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ text: String(text).trim() });
  } catch (e) {
    console.warn("[ctx3] proxy failed:", e?.message);
    return res.status(200).json({ code: "upstream_error" });
  }
}
