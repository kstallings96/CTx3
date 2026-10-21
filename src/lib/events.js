import { insertSession, insertEvents, beaconEvents, isSupabaseConfigured, INSTRUMENT, setSessionId, checkRoster} from "./supabase.js";
import { sha256hex } from "./sha256.js";

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

/**
 * The session uuid, derived rather than random.
 *
 * `sessions.id` is a uuid with no default and `events.session_id` is NOT NULL
 * with a foreign key to it — RowdyRoboVac's shape, and the shape of the
 * database we share with it. The Lab therefore has to supply an id, and the
 * obvious move, a random uuid kept in localStorage, has a hole in it: a
 * device whose storage is cleared and then signed back in under the same code
 * would mint a NEW uuid, collide with the existing row, be told "already
 * there", and then write events pointing at a session that does not exist.
 * Every one of them would fail the foreign key and be lost.
 *
 * Deriving the uuid from the things that define the session closes that:
 * same student, same device, same day gives the same id forever, with nothing
 * persisted and nothing to lose. A different day is a different session,
 * which is what we want — day 2 and day 3 are separate sittings.
 */
function derivedUuid(parts) {
  /* The separator: one NUL, named rather than typed.

     It used to be a raw 0x00 byte sitting inside a string literal here.
     That works, and it survives exactly as long as nothing round-trips
     this source as text -- which several things in this repo have done,
     mangling escapes more than once. If the separator ever changes
     silently, every session uuid re-derives, and every event afterwards
     fails its foreign key against a sessions row that no longer matches.
     Same byte at runtime, and no longer something an editor can eat. */
  const SEP = String.fromCharCode(0);
  const h = sha256hex(parts.join(SEP));
  // Set the version (4) and variant bits so it is a well-formed uuid. It is
  // not random, and nothing here depends on it being random.
  const v = h.slice(0, 32).split("");
  v[12] = "4";
  v[16] = "89ab"[parseInt(v[16], 16) % 4];
  const x = v.join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Register the participant before the first flush. Every event written after
 * this points at the row it creates.
 *
 * `first_name`, `last_initial` and `grade` are NOT NULL on this table, so
 * they are sent on every session row. That constraint is RowdyRoboVac's and
 * it is load-bearing for its data; the Lab satisfies it rather than relaxing it.
 */
export async function startSession(participantCode, deviceId, day, identity, opts = {}) {
  if (!isSupabaseConfigured) { sessionReady = false; return false; }
  const id = derivedUuid([INSTRUMENT, participantCode || "", deviceId || "", String(day ?? "")]);

  // A device resuming after a reload. The row already exists and re-inserting
  // it would only be rejected, so skip the call: the id is derived from the
  // same inputs and addresses the row that is already there.
  //
  // The inputs include the day, so changing ?day= mid-session would point at a
  // session row that was never created. The day belongs to the station's URL
  // and does not change under a student; if you ever change it by hand, reload
  // with ?reset rather than without.
  if (opts.resuming) {
    setSessionId(id);
    sessionReady = true;
    schedule();
    return true;
  }

  const ok = await insertSession({
    id,
    instrument: INSTRUMENT,
    participant_code: participantCode,
    device_id: deviceId,
    day,
    // Identifying fields live on this row and nowhere else. They are never
    // held in event state, so there is no path by which they reach a payload.
    ...(identity || {}),
    user_agent: navigator.userAgent,
    screen_w: screen.width,
    screen_h: screen.height,
  });
  // Stamped onto events at flush time, not at emit time — events queued before
  // sign-in (the model availability probe) then land against the right session
  // instead of being dropped.
  if (ok) setSessionId(id);
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
/**
 * The device's own copy of its events, as JSON.
 *
 * IT USED TO EXPORT THE UNSENT QUEUE, which is almost always empty and is
 * therefore almost always useless. The queue drains the moment a flush
 * succeeds, so a device that worked perfectly exported `events: []` --
 * exactly when you reach for this button to see what a student did. The
 * failure mode it was built for, a device that never reached the network,
 * is the one case where the two are the same thing.
 *
 * `kept` is the retained buffer the app holds (the last few hundred
 * events), passed in rather than read here because it lives in app state.
 * `unsent` still says how many have not reached the database, which is the
 * number that matters when deciding whether to keep the file.
 */
export function exportJSON(participantCode, day, kept) {
  const events = Array.isArray(kept) && kept.length ? kept : queue;
  return JSON.stringify(
    { participantCode, day, exportedAt: new Date().toISOString(),
      unsent: queue.length, count: events.length, events },
    null, 1,
  );
}

export function clearBuffer() {
  queue = [];
  try { localStorage.removeItem(BUF); } catch (e) {}
}

/* Re-exported so app.js takes sign-in concerns from one module. */
export { checkRoster };
