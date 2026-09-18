import { createClient } from "@supabase/supabase-js";

/**
 * Supabase wiring. Matches the Manifest/Mosaic pattern: the anon key is public
 * by design — it ships in the client bundle — and row-level security is what
 * protects the data: INSERT only for anon, no select/update/delete. See
 * supabase/schema.sql.
 *
 * With the env vars absent the client is null and everything here becomes a
 * no-op, so `npm run dev` works with no backend and the activities never
 * depend on the network.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

export const isSupabaseConfigured = supabase !== null;

/* Which app wrote this row. The study database holds every instrument in the
   week, so `instrument` is in both unique keys — see supabase/schema.sql. */
export const INSTRUMENT = "ctx3";

/**
 * Creates the participant row. This is the ONE place first name and last
 * initial are written — a teacher has to be able to match a device to a paper
 * packet, and this row is the entire mechanism. Everything after sign-in is an
 * event, and no event carries a name (see scrub() below).
 */
export async function insertSession(row) {
  if (!supabase) return false;
  const { error } = await supabase.from("sessions").insert(row);
  if (!error) return true;
  // 23505 = unique violation: the row is already there because the student
  // reloaded. That is success as far as we are concerned.
  if (error.code === "23505") return true;
  console.warn("[ctx3] session insert failed:", error.message);
  return false;
}

/* Identifying fields belong on the sessions row and nowhere else. Nothing
   should ever put one in an event payload -- but a stray field in a future
   payload would be an IRB problem discovered months later in a data dump, so
   strip them on the way out rather than trust that nothing ever slips. */
const IDENTIFYING = ["first_name", "firstName", "first", "last_initial", "lastInitial", "initial", "lastName", "last_name", "name", "grade"];
function scrub(payload) {
  if (!payload || typeof payload !== "object") return payload;
  let hit = false;
  for (const k of IDENTIFYING) if (k in payload) { hit = true; break; }
  if (!hit) return payload;
  const clean = { ...payload };
  for (const k of IDENTIFYING) delete clean[k];
  console.warn("[ctx3] stripped an identifying field from an event payload");
  return clean;
}

export function eventRows(events) {
  return events.map((e) => ({
    instrument: INSTRUMENT,
    tool: e.tool ?? null,
    participant_code: e.payload?.participantCode || null,
    device_id: e.deviceId ?? null,
    seq: e.seq,
    type: e.type,
    support_condition: e.payload?.supportCondition ?? "na",
    payload: scrub(e.payload) ?? {},
    client_ts: e.ts,
  }));
}

/**
 * Inserts a batch.
 *
 * A plain insert, deliberately. An upsert needs an UPDATE policy and anon has
 * INSERT only, so Postgres rejects the whole statement with 42501. A plain
 * insert does fail the entire batch on one duplicate — which happens when a
 * retry follows a write that actually landed — so rather than call that
 * success and silently drop every good event sharing the batch, fall back to
 * row-by-row: genuine duplicates are skipped and everything else lands.
 */
export async function insertEvents(events) {
  if (!supabase || events.length === 0) return false;

  const { error } = await supabase.from("events").insert(eventRows(events));
  if (!error) return true;
  if (error.code !== "23505") {
    console.warn("[ctx3] event flush failed:", error.message);
    return false;
  }
  let allResolved = true;
  for (const row of eventRows(events)) {
    const { error: rowError } = await supabase.from("events").insert(row);
    if (rowError && rowError.code !== "23505") {
      console.warn("[ctx3] event insert failed:", rowError.message);
      allResolved = false;
    }
  }
  return allResolved;
}

/** Fire-and-forget flush for page unload, where an await cannot finish. */
export function beaconEvents(events) {
  if (!url || !anonKey || events.length === 0) return false;
  if (typeof navigator.sendBeacon !== "function") return false;
  // `fetch` with keepalive, NOT sendBeacon.
  //
  // sendBeacon cannot set headers, so the key had to go in the query string,
  // and a beacon is sent with credentials mode 'include'. Supabase answers
  // with `Access-Control-Allow-Origin: *`, and a wildcard is not allowed for a
  // credentialed request — so the browser blocked every one of these and the
  // last events of every session were lost without a trace. keepalive fetch
  // is the modern replacement: it outlives the page the same way, and it
  // takes headers, so this is an ordinary authenticated insert.
  //
  // The limit is 64KB across all in-flight keepalive requests. A trimmed tail
  // that arrives beats a full one that is dropped, and anything left behind is
  // still in localStorage for the next load to flush.
  const send = (rows) =>
    fetch(`${url}/rest/v1/events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    }).catch(() => {});

  try {
    let rows = eventRows(events);
    while (rows.length > 1 && JSON.stringify(rows).length > 60000) {
      rows = rows.slice(-Math.ceil(rows.length / 2));
    }
    send(rows);
    return true;
  } catch {
    return false;
  }
}
