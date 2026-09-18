import { insertSession, insertEvents, beaconEvents, isSupabaseConfigured, INSTRUMENT } from "./supabase.js";

/**
 * The durable event queue (EVENTS.md §9, and the same shape Manifest uses).
 *
 * Rules this file exists to keep:
 *   - the UI never blocks on a network call;
 *   - an event is mirrored to localStorage the instant it is emitted;
 *   - nothing leaves the queue until the server confirms it;
 *   - a reload picks up whatever the last session failed to send.
 *
 * School wifi will drop. That is assumed, not handled as an exception.
 */
const BUF = "ctx3.queue.v1";
const BATCH = 20;
const EVERY_MS = 5000;

let queue = [];
let sending = false;
let backoff = 1000;
let timer = null;
let sessionReady = false;

function persist() {
  try { localStorage.setItem(BUF, JSON.stringify(queue.slice(-600))); } catch (e) {}
}
function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(BUF) || "[]");
    if (Array.isArray(v)) queue = v;
  } catch (e) { queue = []; }
}
restore();

/** Unsent events, including any stranded by a previous session. */
export function bufferedCount() { return queue.length; }
/** True when a backend exists to flush to; false means "held locally, by design". */
export const hasBackend = isSupabaseConfigured;

/** Register the participant before the first flush; events reference the code. */
export async function startSession(participantCode, deviceId, day) {
  if (!isSupabaseConfigured) { sessionReady = false; return false; }
  const ok = await insertSession({
    instrument: INSTRUMENT,
    participant_code: participantCode,
    device_id: deviceId,
    day,
    user_agent: navigator.userAgent,
    screen_w: screen.width,
    screen_h: screen.height,
  });
  sessionReady = ok;
  if (ok) schedule();
  return ok;
}

export function log(ev) {
  queue.push(ev);
  persist();
  if (queue.length >= BATCH) flushNow();
  else schedule();
}

function schedule() {
  if (timer || !queue.length) return;
  timer = setTimeout(() => { timer = null; flushNow(); }, EVERY_MS);
}

/**
 * Flush. `final` uses sendBeacon, which cannot report success — so the queue
 * is kept rather than cleared, and a duplicate on the next load is dropped by
 * the (participant_code, seq) unique constraint.
 */
export async function flushNow(final = false) {
  if (!queue.length || !isSupabaseConfigured) return;
  if (final) { beaconEvents(queue.slice(0, 200)); return; }
  if (sending || !sessionReady) return;
  sending = true;
  const batch = queue.slice(0, BATCH);
  try {
    const ok = await insertEvents(batch);
    if (ok) {
      queue = queue.slice(batch.length);
      persist();
      backoff = 1000;
      if (queue.length) schedule();
    } else {
      // Never drop an event the server has not confirmed.
      backoff = Math.min(backoff * 2, 60000);
      setTimeout(() => { timer = null; flushNow(); }, backoff);
    }
  } finally {
    sending = false;
  }
}

/** The last resort in the chain: everything this device still holds. */
export function exportJSON(participantCode, day) {
  return JSON.stringify(
    { participantCode, day, exportedAt: new Date().toISOString(), unsent: queue.length, events: queue },
    null, 1,
  );
}

export function clearBuffer() {
  queue = [];
  try { localStorage.removeItem(BUF); } catch (e) {}
}
