# Deploying CTx3

Same Supabase + Vercel treatment as Manifest, with one addition: a serverless
function holding the model key.

The app runs fine with nothing configured — every network call becomes a no-op,
events stay in `localStorage`, and the model half of Word4Word plays
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

Use an existing project if you have a slot, or:

1. At <https://supabase.com/dashboard>, create a project.
2. Pick a region near the school; save the database password somewhere safe
   (this app never needs it).
3. Wait for provisioning to finish.

Rows are told apart by `instrument` (`ctx3`, `mosaic`, …) and, on events,
`tool` (the activity inside that app). Both are in the dedup keys — without
that, two instruments on the same device would both start at `seq 1` and the
second one's rows would be rejected as duplicates and lost.

### Bringing the other instruments in

**RowdyRoboVac** is the easy one and the useful one. It already has a full
Supabase backend with its own durable queue, and `Scripts/app_config.gd`
fetches credentials from `/config.json` on the deployed origin at runtime —
built precisely so it can be repointed without re-exporting. Moving it here is
**editing one file in its repo**. No Godot, no rebuild.

Two things to know before you do:

1. **Its rows have a different shape.** It keys events on a session uuid
   rather than a code and device. The table carries both — `session_id` is
   nullable and sits in the dedup key — so it can keep writing exactly what it
   writes today. The only GDScript change needed is adding
   `"instrument": "rowdyrobo"` to the two row dictionaries in `backend.gd`;
   two lines, and the GitHub Action re-exports on push.
2. **It reads a leaderboard with the anon key**, so this database is no longer
   insert-only across the board. The exception is scoped to that one table and
   nothing else grants select — verify with the `pg_policies` query in
   `supabase/schema.sql` after any schema change.

**The thing that actually blocks joining RowdyRoboVac data is neither of
those.** It collects first name, last initial and grade, and no participant
code — so its rows cannot be joined to anything regardless of which database
they sit in. That retrofit (read `?pc=` from the URL, write it on the session
row) is the work worth doing, and it is worth doing whether or not the
backends ever merge.

**Mosaic and Manifest** can move in later the same way: add `instrument`, put
their identifying columns in `meta`. Until then their tiles link out and the
join happens at analysis time on the code, exactly as ARCHITECTURE.md says.
Nothing forces either migration before the pilot.

## 2. Create the tables

Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), run it.
Safe to re-run.

Then confirm RLS is actually on — the one check worth doing by hand:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('sessions','events');
```

Both rows must show `rowsecurity = true`. If they don't, students can read each
other's data.

## 3. Get the keys

**Project Settings → API**:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

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

Word4Word calls a real model for its right-hand column. The key cannot ship
in the bundle, so it goes in a Vercel environment variable with **no `VITE_`
prefix** — anything `VITE_`-prefixed is inlined into the client and would be
public.

In the Vercel dashboard, **Settings → Environment Variables**:

| Name | Value | Scope |
|---|---|---|
| `OPENROUTER_API_KEY` | your OpenRouter key | Production, Preview |
| `OPENROUTER_MODEL` | e.g. `openai/gpt-4o-mini` | Production, Preview |
| `VITE_SUPABASE_URL` | project URL | all three |
| `VITE_SUPABASE_ANON_KEY` | anon key | all three |

The `VITE_` ones are build-time, so **redeploy after adding them**.

Cost is not the constraint here. A class of 14 running Word4Word is roughly
twenty short calls for the whole period — cents, on any cheap model. Set a low
spend cap on the OpenRouter key anyway; a stuck loop is the only real risk, and
`api/complete.js` already limits each participant code to 40 calls a minute.

## 6. Deploy

Connect the GitHub repo in the Vercel dashboard (**Add New → Project → import
`kstallings96/CTx3`**). Framework preset **Vite**; the rest is in `vercel.json`.
Push to `main` deploys.

Or from this directory:

```bash
npx vercel --prod
```

---

## Study-day checklist

- `https://<your-app>.vercel.app/?day=2` — the facilitator sets the day; the
  student never chooses it
- `?reset` on any URL clears the device for the next student, including
  anything they had queued but unsent
- Open Word4Word on the projector machine **before** the period and run one
  cell, to confirm the model responds and to wake Supabase
- Free Supabase projects pause after about a week idle and take a minute or two
  to wake. Wake it the morning of, and **test the wake path at least once** —
  otherwise the first student hits a dead endpoint
- Check the top-right pill says **live model**. If it says *offline stand-in*,
  the key is missing or wrong and Word4Word will play recordings

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

Tap the **CTx3** header five times, or use **Show JSON export** in the
facilitator panel. That surfaces everything the device still holds, including
events that never flushed. Copy it out and feed it to `npm run rescore`. It is
the last resort in the resilience chain, not the plan.
