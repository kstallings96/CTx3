/**
 * DEMO MODE — TEMPORARY. Turn this off before the pilot.
 *
 *     export const DEMO = false;
 *
 * That one line restores every gate: the participant code, the roster
 * check, the three activity passwords, and the day gating on the tiles.
 * Nothing else has to be undone, which is the whole reason this lives in
 * its own file rather than as edits scattered through app.js.
 *
 * WHAT IT CHANGES WHILE IT IS ON
 *
 *   - Sign-in is one password, `carmyjane`, and nothing else. No card, no
 *     name, no roster lookup.
 *   - All three activities are open from the hub, on any day, with no
 *     second password.
 *   - Every row written is stamped with the demo code below, so demo work
 *     is one `where participant_code <> 'DEMO00'` away from being excluded
 *     and cannot be mistaken for a student's.
 *
 * WHAT IT IS NOT. This is a door held open for showing the thing to
 * people, not a security decision. The real gates were never strong --
 * see the note in passwords.js -- but they do distinguish one student's
 * rows from another's, and that distinction is the entire basis of the
 * measurement. Running a class in this mode would produce fourteen
 * students' work under one participant code and no way to tell it apart
 * afterwards. The hub says DEMO MODE on screen for exactly that reason.
 */
export const DEMO = true;

/** The one password, while DEMO is on. Case and spacing are forgiven. */
export const DEMO_PASSWORD = "carmyjane";

/**
 * Tool ids left greyed out in demo mode.
 *
 * Not the same as unbuilt: Prompt Golf works, it is just not part of what
 * is being shown. It stays gated rather than merely unclickable, so
 * typing /prompt-golf does not walk around the tile.
 */
export const DEMO_HIDDEN = ["pg"];

export const demoOpen = (toolId) => DEMO && !DEMO_HIDDEN.includes(toolId);

/**
 * Who demo rows belong to.
 *
 * `sessions.first_name`, `last_initial` and `grade` are NOT NULL in the
 * shared study database, so a demo session still has to supply them. It
 * supplies something obviously fake rather than something plausible: a row
 * that reads "Demo User" is a row nobody will later mistake for a
 * thirteen-year-old's.
 */
export const DEMO_IDENTITY = { code: "DEMO00", first: "Demo", initial: "U" };

export const demoPasswordOk = (typed) =>
  String(typed ?? "").trim().toLowerCase().replace(/\s+/g, "") === DEMO_PASSWORD;
