/**
 * What is on the hub, and when.
 *
 * The Machine Lab is more than the tools in this repo. RowdyRoboVac and
 * VibeBuilder Studio are separate apps with their own URLs; the surveys are
 * forms somewhere else again. From a student's side none of that is visible
 * or interesting — there is one place to go, and today's thing is on it. So
 * they are tiles here like anything else, and the only difference is that a
 * tile with an `href` leaves the site.
 *
 * THE EXTERNAL ONES ASK FOR THE CODE THEMSELVES, and that is the weak joint
 * in the week.
 *
 * A tile that links out appends `?pc=<code>`, because the week only becomes
 * one dataset if every tool files its rows under the same participant code.
 * NEITHER APP READS IT TODAY — checked, not assumed: RowdyRoboVac's bundle
 * reads only `?reset`, and VibeBuilder has no query-param handling at all
 * and asks for the code on its own intake screen. The parameter is appended
 * anyway because it costs nothing, is ignored harmlessly, and starts working
 * the day either app chooses to read it.
 *
 * Until then the join depends on a thirteen-year-old copying five characters
 * correctly, which is exactly the failure the code system was meant to
 * prevent. So the tile SHOWS the code at the moment they are about to need
 * it — see `renderHub`. A student reading it off the tile in front of them
 * is a far better bet than one recalling it from the start of the period.
 */

/**
 * `day` is the DEFAULT day a tile opens on, not a rule. The admin page
 * (src/lib/settings.js) overrides it, and when it has, these numbers are
 * ignored entirely. They are here so that a week nobody has touched the
 * admin page for still does the right thing on each morning.
 *
 * `days` for the ones that span more than one.
 */
export const TILES = [
  {
    id: "presurvey", name: "Pre Survey", kind: "link",
    href: "https://utsa.az1.qualtrics.com/jfe/form/SV_ahlzM8ekjzewd4W",
    day: 1, con: "a few questions",
    blurb: "A few questions before we start. There are no right answers.",
  },
  {
    id: "rrv", name: "RowdyRoboVac", kind: "link",
    href: "https://rowdy-robo.vercel.app/",
    day: 1, con: "randomness · algorithms",
    blurb: "Program a robot vacuum and watch what random choices do to a plan.",
  },
  {
    id: "w4w", name: "MonsterMaker", kind: "tool", screen: "w4w",
    day: 2, con: "decomposition · pseudocode",
    blurb: "Write the steps. Run them through the Exact engine, then the AI engine. Same words, two very different results.",
  },
  /* The warm-up: the same screen, the other half of it. Write the steps and
     watch the Exact engine draw them a line at a time.

     It is a SEPARATE TILE rather than a mode switch on the MonsterMaker
     screen, because a mode switch beside the thing a class is watching is an
     invitation to click it mid-demonstration. It is also closed by default
     even on its own day -- you open it from the admin page when the class
     has finished the pipeline, which is the thing the old password used to
     decide. */
  {
    id: "w4wsolo", name: "MonsterMaker · warm-up", kind: "tool", screen: "w4w",
    mode: "solo", query: "?mode=solo",
    day: 2, con: "decomposition", closedByDefault: true,
    blurb: "Write the steps and watch it build them one line at a time. Slow, steady or quick.",
  },
  {
    id: "ftr", name: "AlwaysNever", kind: "tool", screen: "ftr",
    day: 3, con: "reverse-engineering an AI",
    blurb: "An AI is following a secret rule. Ask it questions and work out what the rule is.",
  },
  {
    id: "vbs", name: "VibeBuilder Studio", kind: "link",
    href: "https://vibebuilder-zeta.vercel.app/",
    days: [4, 5], day: 4, con: "abstraction · building",
    blurb: "Describe what you want and build it. Two days, one project.",
  },
  {
    id: "postsurvey", name: "Post Survey", kind: "link",
    href: "https://utsa.az1.qualtrics.com/jfe/form/SV_1Sa5r5hHwXOJEG2",
    day: 5, con: "a few questions",
    blurb: "The same kind of questions as the first one, now that you have done it all.",
  },
  /* bugHunters, which has NO DAY of its own.
   *
   * It is a ten-minute game rather than a day's work, so it is closed by
   * default and opens from the admin page whenever it fits — end of a period,
   * a group who finished early, a day that ran short. Giving it a day number
   * would have put it on the hub every week on that morning whether or not
   * anybody meant to run it.
   *
   * IT DOES NOT USE THE PARTICIPANT CODE. Every other tile here files its
   * rows under the card code; bugHunters asks for a NICKNAME, for a
   * leaderboard, and reads no query parameter at all. So `?pc=` is not
   * appended -- it would be a promise the far end cannot keep -- and the
   * tile does not show the code the way RowdyRoboVac's and VibeBuilder's do,
   * because telling a student to type their code into a box that wants a
   * nickname is worse than saying nothing. Its data stands on its own and
   * does not join to the rest of the week by student. See the note in
   * DEPLOY.md if that needs to change. */
  {
    id: "bh", name: "bugHunters", kind: "link",
    href: "https://bughunters-gamma.vercel.app/",
    noCode: true,
    day: 0, con: "debugging · testing", closedByDefault: true,
    blurb: "An AI built an app for a younger kid. Something in it is broken — find the glitches.",
  },
  /* Built and working, and not part of this week. It stays in the list so it
     is one admin checkbox away rather than a deploy away, and stays closed so
     a student who finds /prompt-golf does not wander into it. */
  {
    id: "pg", name: "Prompt Golf", kind: "tool", screen: "pg",
    day: 0, con: "abstraction · debugging", closedByDefault: true,
    blurb: "Hit the target in as few words as possible. Opens by fixing someone else's broken prompt.",
  },
];

export const tileById = (id) => TILES.find((t) => t.id === id) || null;

/** Tiles that open on this day with nobody having touched the admin page. */
export function defaultOpen(day) {
  return TILES
    .filter((t) => !t.closedByDefault && (t.days ? t.days.includes(day) : t.day === day))
    .map((t) => t.id);
}

/**
 * A tile that links out, with the participant code attached.
 *
 * The code goes on as `?pc=`, which RowdyRoboVac and VibeBuilder both read
 * and use to prefill their own sign-in. A tile whose href carries a query of
 * its own still works — this appends rather than assumes.
 *
 * `noCode` opts a tile out. bugHunters identifies students by a nickname and
 * has no participant-code field to fill, so sending one would be a parameter
 * that silently does nothing — and worse, it would look from this side like
 * the join had been taken care of.
 */
export function hrefFor(tile, code) {
  if (!tile || !tile.href) return null;
  if (!code || tile.noCode) return tile.href;
  return tile.href + (tile.href.includes("?") ? "&" : "?") + "pc=" + encodeURIComponent(code);
}
