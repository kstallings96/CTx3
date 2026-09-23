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

**Until you run it, CTx3 writes nothing.** The client is wired and correct; the
inserts come back `PGRST204 Could not find the 'day' column of 'sessions'`.
That is the only thing standing between here and live data.

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
| `OPENROUTER_MODEL` | `anthropic/claude-haiku-4.5` | Production, Preview |
| `VITE_SUPABASE_URL` | project URL | all three |
| `VITE_SUPABASE_ANON_KEY` | anon key | all three |

The `VITE_` ones are build-time, so **redeploy after adding them**.

### Which model

`anthropic/claude-haiku-4.5` is the default in `api/complete.js`, and it is
worth the small premium. MonsterMaker asks for a tight format and a tight
vocabulary, and the cheapest models follow both unreliably — a run the safety
guard has to withhold teaches nothing.

| Slug | in / out per Mtok | Note |
|---|---|---|
| `anthropic/claude-haiku-4.5` | $1.00 / $5.00 | Default. Best format-following of the three. |
| `openai/gpt-5-mini` | $0.25 / $2.00 | Cheaper, still reliable. |
| `openai/gpt-4o-mini` | $0.15 / $0.60 | Cheapest. Expect more withheld runs. |

**Cost is not the constraint.** A projector session is about thirty short
calls: roughly **three cents a period** on the default. Set a low spend cap on
the key anyway — a stuck loop is the only real risk, and `api/complete.js`
already limits each participant to 40 calls a minute.

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

## Activity passwords

Every tool is behind a password. The sequence a student sees is **sign in,
password, activity**.

- On a **pinned URL**, only that tool's password is accepted.
- On the **hub URL**, the prompt takes any of the three and sends the student
  to the one it belongs to — so on `/` the password *is* how the activity gets
  chosen. That is the same three steps with no tile-picking in between.

The passwords as shipped:

| Tool | Password |
|---|---|
| AlwaysNever | `roadrunners` |
| Prompt Golf | `holeinone` |
| MonsterMaker | `gorowdy` |

These are in the repo's history, so anyone who can read the repo can read
them. That is the same speed-bump caveat as below, not a new problem — but if
you want words no one outside the room has seen, change them:

```bash
npm run passwords -- ftr=<word> pg=<word> w4w=<word>
```

That rewrites `src/passwords.js` with a salted SHA-256 of each word; the words
themselves are never written to disk. `npm run passwords` with no arguments
shows which tools are set. Rebuild and redeploy for a change to reach
students. Setting a tool to an empty string removes its password and the tool
opens straight away.

Behaviour worth knowing on a study day:

- An unlock is remembered on the device until `?reset`, so a student who
  reloads mid-activity is **not** locked out of their own work.
- Three wrong tries disables the button for three seconds. A pause, not a
  lockout — a student who cannot spell the word still gets in.
- `gate_failed` and `gate_unlocked` are logged, with the tool and the try
  count and **never the typed text**. A student stuck at the gate for four
  minutes is visible in the data afterwards.

**Be honest about what this is.** The digests ship in the client bundle, and a
dictionary word behind a single SHA-256 is minutes of work for an adult with a
wordlist. It stops a student who opens devtools out of curiosity; it does not
stop one who is trying. It is hashed rather than plaintext so the words are
not sitting in a public GitHub repo at a glance — that is all. What it is
genuinely for is making the facilitator the one who decides when the room
starts, and keeping a class off Thursday's tool on Tuesday. **Do not describe
it to the IRB as access control.**

The same goes for the paths: a student who types `/monstermaker` reaches
MonsterMaker's password prompt, not MonsterMaker. The password is the gate; the URL
just decides which one they are asked for.

## Study-day checklist

- Open the **station's own URL** (see the table above) — it carries the right
  day with it. On the hub URL, `?day=2` sets the day; the student never
  chooses it either way
- **Next student** in the topbar, or `?reset` on any URL, clears the device
  for the next student: their name, their unlocked activities, and anything
  they had queued but unsent
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
