# Deploying CTx3

Same Supabase + Vercel treatment as Manifest, with one addition: a serverless
function holding the model key.

The app runs fine with nothing configured — every network call becomes a no-op,
events stay in `localStorage`, and the model half of MonsterMaker plays
pre-recorded runs labelled as recordings. These steps add the backend.

**I can't create accounts or log in on your behalf, so steps 1, 2, 5 and 6 are
yours. Everything else is already wired.**

---

## 1. The Supabase project

**One project holds every instrument in the week, not one per tool.** The free
tier allows two, and the week has more instruments than that — but the quota is
not the real argument. RQ3 asks which CT skills show up in which data channel,
and that question is a join on the participant code across Mosaic, Manifest,
RowdyRobo and CTx3. Separate databases make it a spreadsheet exercise; one
database makes it a `group by`.

It also halves the study-day risk: a free project pauses after about a week
idle, and one project is one thing to wake on the morning of instead of three.

### The project

Settled: **`jfitzhyrtrurrvhifums`** — the one RowdyRoboVac already writes to.
CTx3 had no rows and no deployment, so repointing it was two environment
variables; RowdyRoboVac is a live Godot export behind a GitHub Action.

Its tables are already there and **their shape is not the one this repo
originally assumed**, which is worth knowing before you run anything:

| | what is there | what CTx3 needs |
|---|---|---|
| `sessions.id` | `uuid` — RowdyRoboVac's session id | unchanged |
| `sessions` | `first_name`, `last_initial`, `grade`, `user_agent`, `screen_w`, `screen_h`, `started_at` | plus `instrument`, `participant_code`, `device_id`, `day`, `meta` |
| `events` | `session_id`, `seq`, `type`, `payload`, `client_ts`, `server_ts` | plus `instrument`, `tool`, `participant_code`, `device_id`, `support_condition` |
| `scores` | RowdyRoboVac's, insert-only | untouched |
| `leaderboard` | a **VIEW** over `scores`, exposing `display_name`, `score`, `created_at` and nothing else | untouched |

`supabase/schema.sql` has been rewritten as a migration that fits it. Three
things it does deliberately:

1. **`instrument` is added with a default of `'rowdyrobo'`.** RowdyRoboVac's
   `backend.gd` does not send the column and now does not have to — its
   inserts keep working untouched. No GDScript edit, no re-export, no Action
   run. (The earlier plan of adding two lines to `backend.gd` is off the
   table; this is strictly less risk.) CTx3 always sends it explicitly.
2. **Dedup is two partial indexes, not one.** The instruments identify a
   session differently — RowdyRoboVac by uuid, CTx3 by code plus device. A
   single index over a COALESCE of both would have had to treat a null
   participant code as a value, and then every RowdyRoboVac session row would
   collide with every other one and the second student of the day would
   silently fail to start.
3. **Nothing is dropped, renamed or retyped.** Every statement is `if not
   exists` or `add column if not exists`. Safe to re-run.
4. **RLS is applied through a `DO` block that skips anything that is not an
   ordinary table**, and it touches only `sessions` and `events`. The first
   version of this file tried to `alter table leaderboard enable row level
   security` and died with `42809: this operation is not supported for
   views` — `leaderboard` is a view over an insert-only `scores` table, which
   is how RowdyRoboVac's end screen reads scores back without ever exposing
   `session_id`. That design is correct and this file now leaves both the
   view and `scores` completely alone.

Because that view exists, **this database is not read-proof and was never
meant to be**. The check to run after any schema change is not "nothing is
readable" but "only the leaderboard view is":

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' order by tablename, cmd;
```

Only `INSERT` may appear. A `SELECT` policy on `sessions`, `events` or
`scores` means one student can read another's data.

If `create unique index` fails, it is because duplicate rows already exist
that the index would forbid. Send me the error rather than forcing it.

## 1b. Identifying data on minors

CTx3 asks every student for a **first name and last initial** at sign-in, so a
teacher can match a device to a paper packet. That is the only reason it is
collected, and the code stays the unit of analysis everywhere else.

What the code guarantees, and what you should be able to say on a form:

- The name is written **once**, to the `sessions` row, at sign-in. Nowhere
  else. Not in an event payload, not in a URL, not in console output, not in
  `localStorage` — a resumed device re-registers on the code alone.
- `src/lib/supabase.js` strips identifying keys from every outgoing event
  payload as a backstop and warns to the console if it ever has to. Verify
  after the pilot with the `payload::text ~*` query in `supabase/schema.sql`;
  it must return zero.
- RLS grants anon INSERT only, so no student can read another's row. The name
  is readable only with the service_role key, from your machine.

What the code cannot do for you, and you have to do:

- **Name these fields explicitly** on the consent and assent forms — "first
  name and last initial" — not "de-identified data". With a name and a grade
  and a class roster, this is identifiable.
- **State a deletion date** on those forms, and keep it. The plain version is:
  once the packets are matched to codes and the match is written down, the name
  columns have no further use. `update sessions set first_name = null,
  last_initial = null;` after the study is a one-line query — put the date on
  your calendar the day you deploy.
- RowdyRoboVac already collects first name, last initial **and grade** under
  whatever consent you have for it. Sharing a database does not change what
  either instrument collects, but it does mean one form should now cover both.

## 2. Create the tables

Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), run it.
Safe to re-run, and safe on the existing RowdyRoboVac tables — see the table
above for what it changes.

**Until you run it, CT Week writes nothing.** The client is wired and correct;
the inserts come back `PGRST204 Could not find the 'day' column of 'sessions'`.
That is the only thing standing between here and live data.

Then paste [`supabase/roster.sql`](supabase/roster.sql) — the class list, so a
mistyped card is refused at sign-in instead of becoming a participant nobody
can account for — and [`supabase/settings.sql`](supabase/settings.sql), which
is what makes the admin page reach every Chromebook instead of just the one
you are sitting at. All three are safe to re-run.

To check what has actually landed, which no screen in the app can show you
(row-level security is insert-only by design, so the client can write but
never read back):

```sql
select s.participant_code, st.role, s.day, count(e.id) as events,
       max(e.client_ts) as last_seen
from sessions s
left join students st on st.username = s.participant_code
left join events e on e.session_id = s.id
where s.instrument = 'ctx3'
group by 1,2,3 order by last_seen desc nulls last;
```

Then confirm RLS is actually on — the one check worth doing by hand:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('sessions','events');
```

Both rows must show `rowsecurity = true`. If they don't, students can read each
other's data.

## 3. Get the keys

**Project Settings → API**:

- **Project URL** → `VITE_SUPABASE_URL` — `https://jfitzhyrtrurrvhifums.supabase.co`
- **anon / publishable** key → `VITE_SUPABASE_ANON_KEY` — the `sb_publishable_…` one

Both are already in `.env.local` here, which is gitignored. They still have to
be set in the Vercel dashboard (step 5) — that part is yours.

The anon key is *meant* to be public; it ships in the client bundle and anyone
can read it from devtools. RLS is what protects the data.

> **Never** put the `service_role` key in this app, in `.env`, or in the repo.
> It bypasses RLS completely. Use it only from your own machine when pulling
> data for analysis.

## 4. Test locally

```bash
cp .env.example .env.local   # fill in the two VITE_ values
npm install
npm run dev
```

Enter a roster code and play a session. In Supabase → **Table Editor** you
should see one `sessions` row and a stream of `events` rows with `seq` starting
at 1 and `support_condition` populated on every one.

Note the `/api/complete` route does **not** run under `npm run dev` — use
`npx vercel dev` if you want to exercise the model locally.

## 5. The model key

MonsterMaker calls a real model for its right-hand column. The key cannot ship
in the bundle, so it goes in a Vercel environment variable with **no `VITE_`
prefix** — anything `VITE_`-prefixed is inlined into the client and would be
public.

In the Vercel dashboard, **Settings → Environment Variables**:

| Name | Value | Scope |
|---|---|---|
| `OPENROUTER_API_KEY` | your OpenRouter key | Production, Preview |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | Production, Preview |
| `VITE_SUPABASE_URL` | project URL | all three |
| `VITE_SUPABASE_ANON_KEY` | anon key | all three |

The `VITE_` ones are build-time, so **redeploy after adding them**.

### Which model

`openai/gpt-4o-mini` is the default in `api/complete.js`. **Keep this table
and that line agreeing with the Vercel variable.** They disagreed once — the
repo said Haiku, the dashboard said gpt-4o-mini — and the only symptom was
replies longer than anyone expected, with the first thing checked being the
wrong number.

Prices per million tokens, from the OpenRouter catalogue:

| Slug | in / out per Mtok | Note |
|---|---|---|
| `openai/gpt-4o-mini` | $0.15 / $0.60 | **Default.** Measured 5/5 on AlwaysNever rule-following, ~35 words a reply. |
| `anthropic/claude-haiku-4.5` | $1.00 / $5.00 | ~8× the price. Reach for it only if a rule starts slipping. |
| `openai/gpt-4.1-nano` | $0.10 / $0.40 | Cheapest tested. Not measured on rule-following — do that before using it. |

**Cost is not the constraint, so do not choose on it.** Measured against the
real prompts, a class period is ~124 calls and a five-day week is:

| | whole week |
|---|---|
| `openai/gpt-4o-mini` | **$0.06** |
| `anthropic/claude-haiku-4.5` | **$0.45** |

Thirty-nine cents separates them across the entire pilot. What does matter is
whether the model follows a student's hidden rule *every* time: a reply that
drops the rule on turn four marks a student wrong for reasoning correctly
from the evidence in front of them.

There used to be an `npm run record` here that put the whole rule set through
the live model and reported where any rule broke down. It is gone, along with
the Day 3 screen that displayed its output — see `ftrReveal` in `src/app.js`.
If you want that assurance again, the cheapest version is to open the
authoring round yourself, write two or three instructions of the kind
students write, and watch whether the replies hold them.

Set a low spend cap on the key anyway — a stuck loop is the only real risk,
and `api/complete.js` already limits each participant to 40 calls a minute.

`temperature` is pinned to 1 rather than left to the provider default. The
variation between identical calls *is* the lesson, and a provider quietly
shipping a lower default would make the day's central claim look false in
front of the class.

### Keeping model output classroom-safe

Two layers, and the second fails closed:

1. The prompt constrains the model to numbered build steps, a fixed part
   vocabulary, at most eight steps, and names the audience.
2. `checkSafe` in `src/w4w.js` runs on every output **before it is displayed
   or drawn**, and on the class's own instruction before it is sent. It
   rejects anything not shaped like build steps, anything over a length cap,
   and anything matching a word list. A rejected run shows as *"that run was
   held back"* with no text, and logs `run_withheld`.

The word list is deliberately blunt and will occasionally hold back a
harmless run. That is the intended trade; it is one array in `src/w4w.js` if
you want it looser.

### "The model isn't working"

The status pill now names the actual reason instead of just saying *offline
stand-in*. The three you will meet:

- **`npm run dev`** — Vite alone does not serve `/api/complete`, which is a
  Vercel function. This is not a fault. Use `npx vercel dev` to exercise the
  model locally.
- **No `OPENROUTER_API_KEY` on the deployment** — add it and **redeploy**.
- **The published demo** — there is no server at all, by design. It plays
  pre-recorded real runs.

In every case MonsterMaker still runs: five genuine recorded runs, labelled as
recordings on every card.

## 6. Deploy

Connect the GitHub repo in the Vercel dashboard (**Add New → Project → import
`kstallings96/CTx3`**). Framework preset **Vite**; the rest is in `vercel.json`.
Push to `main` deploys.

Or from this directory:

```bash
npx vercel --prod
```

---

## The URLs

One deployment, four URLs. The rewrite in `vercel.json` already serves the app
on any path, so this needs no extra Vercel projects, no extra environment
variables and no second thing to keep awake.

| URL | What the student gets |
|---|---|
| `https://<app>.vercel.app/` | The hub. Sign in, then pick from the three tiles. |
| `https://<app>.vercel.app/alwaysnever` | Sign in, then straight into AlwaysNever. No hub, no tiles, no way out. |
| `https://<app>.vercel.app/prompt-golf` | Same, for Prompt Golf. |
| `https://<app>.vercel.app/monstermaker` | Same, for MonsterMaker. |

Three things a pinned URL does that the hub does not:

1. **It sets its own day.** `/monstermaker` is day 2, the other two are day 3.
   "The facilitator opened the right URL but forgot `?day=2`" costs you a
   period's data and is cheaper to design out than to remember. An explicit
   `?day=` still overrides, if you ever need to.
2. **It hides the Hub button and the "Back to hub" buttons**, so a student
   cannot wander into the tool you are running on Thursday.
3. **It survives `?reset` and reload.** The path stays on hand-off to the next
   student, and a device reloaded mid-period comes back to the station's tool
   rather than to wherever the page last saved.

The hub build now also keeps the address bar honest: entering a tool from a
tile pushes that tool's URL, and Back returns to the hub. So you can read a
tool's URL straight off the screen instead of looking it up here.

## Passwords, and the admin page

There are **two passwords**, and there is no longer one per activity.

| | Word | Who gets it |
|---|---|---|
| `entry` | `roadrunners` | the whole class — say it out loud |
| `admin` | `carmyworm` (also in `admin-password.txt`) | you, and nobody in the room |

The sequence a student sees is **passcode → their own card → the hub**. The
passcode is typed once per device and survives `?reset`, because the next
student is in the same room being handed the same laptop; what `?reset` clears
is the person, not the door.

`admin-password.txt` is gitignored and is the only plain-text copy of the
admin word. Change either with:

```bash
npm run passwords -- entry=<word> admin=<word>
```

That rewrites `src/passwords.js` with a salted SHA-256 of each; the words
themselves never enter the repo. The script **refuses to set them to the same
word** — telling the class the admin word hands them the whole week. Rebuild
and redeploy for a change to reach students.

### Which activity is open

Not a password any more. **`/admin`** is a page with a checkbox per tile:
tick what should be open, press Save, and every student's hub changes. It is
reachable without the passcode, and the passcode does not open it.

Three buttons that are not the same thing:

- **Just today's** — load the day defaults into the checkboxes, ready to edit
- **Close everything** — a hub with nothing on it, until you come back
- **Back to day defaults** — stop overriding; each morning opens on its own

With nobody having touched it, the week runs on the defaults in
`src/tiles.js`: day 1 RowdyRoboVac and the pre-survey, day 2 MonsterMaker,
day 3 AlwaysNever, days 4–5 VibeBuilder, day 5 the post-survey. The
MonsterMaker warm-up and Prompt Golf are closed on every day and only open
from this page.

> **Run [`supabase/settings.sql`](supabase/settings.sql) once.** Until you do,
> the admin page saves to *the browser you are sitting at* and the page says so
> in those words. With the table, one change on one device reaches the room.

Behaviour worth knowing on a study day:

- A tile that is shut cannot be walked around by typing its URL. `/alwaysnever`
  on a day AlwaysNever is closed lands on the hub and logs `tile_refused`.
- Three wrong tries disables the button for three seconds. A pause, not a
  lockout — a student who cannot spell the word still gets in.
- `gate_failed` and `gate_unlocked` are logged with the try count and **never
  the typed text**. A student stuck at the door for four minutes is visible in
  the data afterwards.
- `admin_tiles_set` records every change, including whether it reached the
  class or only that device.
- A tile that links out (RowdyRoboVac, VibeBuilder, either survey) opens in a
  new tab with `?pc=<code>` appended and logs `left_for_tool` first. Without
  that row the data shows a student signing in and then nothing at all.

**Be honest about what this is.** The digests ship in the client bundle, and a
dictionary word behind a single SHA-256 is minutes of work for an adult with a
wordlist. It stops a student who opens devtools out of curiosity; it does not
stop one who is trying. The `settings` table is writable by the anon key for
the same reason and with the same caveat — see the comments in
`supabase/settings.sql`, which explain why that trade was taken and what it
does **not** expose. Nothing study-critical is reachable through it: `events`
and `sessions` are insert-only and unaffected. **Do not describe any of this
to the IRB as access control.**

### The surveys are placeholders

`src/tiles.js` ships `https://example.com/ct-week-pre-survey` and
`…/ct-week-post-survey`. Replace both `href` values with the real forms and
drop the `placeholder: true` flag. Until you do, the tiles work and log
`left_for_tool` with `placeholder: true`, so a run done against the stubs is
identifiable afterwards rather than silently empty.

## Study-day checklist

- Open the **station's own URL** (see the table above) — it carries the right
  day with it. On the hub URL, `?day=2` sets the day; the student never
  chooses it either way
- **Next student** in the topbar, or `?reset` on any URL, clears the device
  for the next student: their name, their code, and anything they had queued
  but unsent. The class word stays — the next student is in the same room
- Open MonsterMaker on the projector machine **before** the period and run one
  cell, to confirm the model responds and to wake Supabase
- Free Supabase projects pause after about a week idle and take a minute or two
  to wake. Wake it the morning of, and **test the wake path at least once** —
  otherwise the first student hits a dead endpoint
- Check the top-right pill says **live model**. If it says *offline stand-in*,
  the key is missing or wrong and MonsterMaker will play recordings

## The shareable demo

`npm run demo` builds with `--mode demo`, which blanks the Supabase variables
via `.env.demo` so the published artifact **cannot write to the study
database**. `scripts/bundle-demo.mjs` refuses to write a demo containing a
`supabase.co` URL or a key, so building it the wrong way fails loudly rather
than quietly publishing something that files rows against real participant
codes. Never publish the output of a plain `npm run build`.

## The facilitator panel

Students see one column: the activity and nothing else. The event stream,
the derived figures, the force-offline switch and the JSON export are for
the person running the study, and on a student's screen they are clutter
competing with the thing they are meant to be looking at.

Two ways to bring them back:

- **Five taps on the CTx3 wordmark**, top left. Five more closes it.
- **`?facilitator`** on any URL, e.g.
  `https://<app>.vercel.app/monstermaker?facilitator`, to have it open from
  the start on a projector machine.

Nothing is removed — the JSON export is still the last resort when a device
never reached the network (see below), and it is still there behind the
gesture.

## Pulling the data

With the service_role key, from your own machine, never from the app. Starter
queries — including the developmental-range calculation — are at the bottom of
[`supabase/schema.sql`](supabase/schema.sql).

Then recompute every derived field from the raw log, which is how the step
sequences stay revisable:

```bash
npm run rescore -- export.json --check --csv rows.csv
```

`--check` compares what the tools stored at emit time against a fresh
recomputation. They run the same code, so any disagreement is a real bug — a
tool that failed to capture a raw input — not drift to shrug at.

## If a device never reached the network

Tap the **CTx3** header five times to open the facilitator panel, then use
**Show JSON export**. That surfaces everything the device still holds, including
events that never flushed. Copy it out and feed it to `npm run rescore`. It is
the last resort in the resilience chain, not the plan.
