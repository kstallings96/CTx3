/**
 * The model, from the client's side.
 *
 * Two homes, one codebase:
 *   - deployed, it calls /api/complete, which holds the OpenRouter key
 *     server-side (api/complete.js). Nothing secret reaches the browser.
 *   - inside a Claude artifact, there is no server, so it uses the viewer's
 *     own Claude via the sample capability instead.
 *
 * Caching is off either way. A repeat has to really be a repeat — that is the
 * whole claim Word4Word's right-hand column makes.
 */
let available = null;
let sampleFn = null;
let reason = null;
let model = null;

const inArtifact = () => typeof window !== "undefined" && window.claude && typeof window.claude.use === "function";

export async function modelAvailable() {
  if (available !== null) return available;
  if (inArtifact()) {
    try { sampleFn = await window.claude.use("sample"); } catch { sampleFn = null; }
    available = !!sampleFn;
    if (!available) reason = "no_sample";
    return available;
  }
  try {
    const r = await fetch("/api/complete", { method: "GET", cache: "no-store" });
    const j = await r.json();
    available = Boolean(j && j.ok);
    // Say WHICH thing is missing. "Offline stand-in" with no reason sends a
    // facilitator hunting through the Vercel dashboard on a study morning
    // when the answer is usually one of three specific things.
    if (!available) reason = "no_key";
    model = (j && j.model) || null;
  } catch {
    available = false;
    // /api/complete is a Vercel function. `npm run dev` is Vite alone and
    // does not serve it, so the GET comes back as index.html and the JSON
    // parse throws. That is the single most common cause of "the model isn't
    // working" and it is not a fault at all -- use `npx vercel dev`.
    reason = location.port && location.hostname === "localhost" ? "vite_dev" : "no_endpoint";
  }
  return available;
}

/** Why the model is unavailable, for the status note. Null when it is fine. */
export function modelReason() { return available ? null : reason; }
/** Which model the server says it will use, once probed. */
export function modelName() { return model; }

export async function askModel(prompt, signal) {
  if (sampleFn) {
    try {
      // `default`, not `quick`. The task is "follow a tight format and a tight
    // vocabulary", which the cheapest tier does unreliably -- and an answer
    // the guard has to withhold teaches nothing. Cost here is a handful of
    // short calls for one class period.
    const r = await sampleFn(prompt, { modelTier: "default", cache: false, signal });
      return (r && r.text) || "";
    } catch (e) {
      throw Object.assign(new Error(e && e.code ? e.code : "upstream_error"),
        { code: e && e.code === "cancelled" ? "cancelled" : (e && e.code) || "upstream_error" });
    }
  }
  const r = await fetch("/api/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ prompt, participantCode: window.__CTX3_CODE__ || "anon" }),
  }).catch((e) => {
    if (e && e.name === "AbortError") throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    throw Object.assign(new Error("network"), { code: "upstream_error" });
  });
  const j = await r.json().catch(() => ({ code: "upstream_error" }));
  if (j.code) throw Object.assign(new Error(j.code), { code: j.code });
  return j.text || "";
}
