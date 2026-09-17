/**
 * Client side of the model proxy. The key lives on the server (api/complete.js);
 * nothing secret reaches the browser.
 */
let available = null;

/** One probe at load. Tells us whether a key is configured, not what it is. */
export async function modelAvailable() {
  if (available !== null) return available;
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
