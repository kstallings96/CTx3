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

const inArtifact = () => typeof window !== "undefined" && window.claude && typeof window.claude.use === "function";

export async function modelAvailable() {
  if (available !== null) return available;
  if (inArtifact()) {
    try { sampleFn = await window.claude.use("sample"); } catch { sampleFn = null; }
    available = !!sampleFn;
    return available;
  }
  try {
    const r = await fetch("/api/complete", { method: "GET", cache: "no-store" });
    const j = await r.json();
    available = Boolean(j && j.ok);
  } catch {
    available = false;
  }
  return available;
}

export async function askModel(prompt, signal) {
  if (sampleFn) {
    try {
      const r = await sampleFn(prompt, { modelTier: "quick", cache: false, signal });
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
