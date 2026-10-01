/**
 * Which tiles are open right now.
 *
 * Three answers, in order of authority:
 *
 *   1. what the facilitator set on the admin page, shared through Supabase
 *   2. what the facilitator set on THIS device, if Supabase could not answer
 *   3. the day defaults in src/tiles.js, if nobody has ever said
 *
 * The local copy is not a cache of (1) — it is the whole mechanism when
 * `supabase/settings.sql` has not been run, and the fallback when the wifi
 * is down in the middle of a period. Either way the hub has an answer and
 * never shows a student a blank page while a fetch decides.
 */
import { defaultOpen } from "../tiles.js";
import { readOpenTiles, writeOpenTiles } from "./supabase.js";

const LS = "ctx3.tiles.v1";

/* Read once at boot and kept here, because the hub repaints on every
   navigation and a network round trip per repaint would make the tiles
   flicker. refresh() is what re-reads it. */
let shared = null;          // from Supabase, or null if it could not answer
let loaded = false;         // has refresh() finished at least once?

function local() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || "null");
    return Array.isArray(raw?.open) ? raw.open : null;
  } catch { return null; }
}

function saveLocal(tiles) {
  try { localStorage.setItem(LS, JSON.stringify({ open: tiles, at: Date.now() })); } catch {}
}

/** Pull the shared list. Safe to call repeatedly; never throws. */
export async function refresh() {
  shared = await readOpenTiles();
  loaded = true;
  /* A shared answer replaces the local copy rather than merging with it.
     Merging would mean a tile this device opened last week could never be
     closed from the admin page, which is the one thing the admin page is
     for. */
  if (shared) saveLocal(shared);
  return shared;
}

export const settingsLoaded = () => loaded;

/**
 * True when what you are looking at came from the admin page rather than
 * from the day defaults. The admin page says so on screen, because "I closed
 * everything and it still shows Tuesday's tile" and "nobody has set this
 * yet" look identical otherwise.
 */
export function source() {
  if (shared) return "shared";
  if (local()) return "device";
  return "default";
}

/** The ids that are open, for this day. */
export function openTiles(day) {
  const set = shared || local();
  return set || defaultOpen(day);
}

export const isOpen = (id, day) => openTiles(day).includes(id);

/**
 * Save a new list. Returns where it landed, so the admin page can tell you
 * the truth rather than a tick that means nothing: "saved for the class" and
 * "saved on this laptop only" are very different states to be in five
 * minutes before a period starts.
 */
export async function setOpenTiles(tiles) {
  const clean = [...new Set(tiles)];
  saveLocal(clean);
  const ok = await writeOpenTiles(clean);
  if (ok) { shared = clean; loaded = true; }
  return ok ? "shared" : "device";
}

/**
 * Hand the week back to the day defaults.
 *
 * NOT the same as closing everything, and the admin page keeps them as two
 * separate buttons for that reason. This writes null — "nobody has said" —
 * where closing everything writes an empty list. A device reading null falls
 * back to the day defaults and the week runs itself; a device reading []
 * shows a student a hub with nothing on it. One of those is a Monday morning
 * you can walk away from and the other is a phone call.
 */
export async function clearOverride() {
  try { localStorage.removeItem(LS); } catch {}
  shared = null;
  return (await writeOpenTiles(null)) ? "shared" : "device";
}
