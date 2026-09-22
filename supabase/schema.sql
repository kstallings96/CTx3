-- The study database — one Supabase project for every instrument in the week.
-- Run in the SQL editor. Safe to re-run, and safe to run on a project that
-- already holds another instrument's tables: every statement is guarded and
-- nothing here drops, renames or retypes an existing column.
--
-- WHY ONE PROJECT, NOT ONE PER TOOL
--
-- The free tier allows two projects, and the week has more instruments than
-- that. But the quota is not the real argument. RQ3 asks which CT skills are
-- visible in which data channel, and that question is a JOIN: the same
-- participant code across Mosaic, Manifest, RowdyRobo and CTx3. Three separate
-- databases means three dumps reconciled by hand in a spreadsheet. One
-- database means the join is a GROUP BY.
--
-- It also halves the study-day risk. A free project pauses after about a week
-- idle and takes a minute or two to wake; one project is one thing to keep
-- warm on the morning of, instead of three.
--
-- Rows are told apart by `instrument` (which app wrote this) and, on events,
-- `tool` (which activity inside that app). Both are in the unique indexes —
-- without that, two instruments on the same device would both start at seq 1
-- and the second one's rows would be rejected as duplicates and silently lost.
--
-- THIS FILE ASSUMES ROWDYROBOVAC'S SHAPE, because that is the instrument
-- already deployed and already holding rows. A session's identity is the uuid
-- in `sessions.id`; `events.session_id` points at it. CTx3 does not use that
-- pair — it identifies a session by participant code and device — so both
-- shapes coexist and each has its own dedup index below.

-- ---------------------------------------------------------------------
-- Tables. These run on a fresh project; on a project that already has
-- RowdyRoboVac's tables they are skipped and the ALTERs below do the work.
-- ---------------------------------------------------------------------
-- NOT NULL on this table, inherited from RowdyRoboVac and satisfied rather
-- than relaxed by CTx3: id, first_name, last_initial, grade. Those
-- constraints are load-bearing for RowdyRoboVac's data and dropping them to
-- make a new instrument fit would be the wrong trade. CTx3 sends a derived
-- uuid, the name from sign-in, and a grade constant (src/roster.js).
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  instrument text not null default 'rowdyrobo',   -- 'ctx3' | 'rowdyrobo' | 'mosaic' | 'manifest'
  participant_code text,               -- CTx3's identifier; null on RowdyRoboVac's rows
  device_id text,
  day int,
  -- IDENTIFYING DATA ON MINORS. It lives here and in no other table, never in
  -- an events payload, never in a URL, never in console output. Every
  -- instrument writes it to this row or not at all.
  --
  -- Your consent and assent forms have to name these fields explicitly, and
  -- you need a stated deletion date that appears on those forms. Write the
  -- date down somewhere other than this comment.
  first_name text,
  last_initial text,
  grade text,
  user_agent text,
  screen_w int,
  screen_h int,
  -- Anything an instrument needs that this shape does not carry.
  meta jsonb not null default '{}',
  started_at timestamptz not null default now()
);

create table if not exists events (
  id bigserial primary key,
  instrument text not null default 'rowdyrobo',
  tool text,                           -- the activity inside the instrument
  -- NOT NULL with a foreign key to sessions.id on the live database. Both
  -- instruments supply it; the client queue does not flush until the session
  -- row exists, so nothing can be written that would violate the key.
  session_id uuid,
  participant_code text,               -- CTx3's key; null on whole-class rows, by design
  device_id text,
  seq int not null,
  type text not null,
  -- high | low | na. Every CTx3 event carries it; the developmental-range
  -- framework depends on being able to split any analysis by condition.
  support_condition text not null default 'na',
  payload jsonb not null default '{}',
  client_ts timestamptz not null,
  server_ts timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Columns CTx3 needs that a RowdyRoboVac-era table will not have.
--
-- `instrument` is added WITH A DEFAULT on purpose. RowdyRoboVac's backend.gd
-- does not send the column and does not have to: its inserts keep working
-- untouched, no GDScript edit, no re-export, no GitHub Action run. CTx3 always
-- sends it explicitly.
-- ---------------------------------------------------------------------
alter table sessions add column if not exists instrument       text not null default 'rowdyrobo';
alter table sessions add column if not exists participant_code text;
alter table sessions add column if not exists device_id        text;
alter table sessions add column if not exists day              int;
alter table sessions add column if not exists first_name       text;
alter table sessions add column if not exists last_initial     text;
alter table sessions add column if not exists grade            text;
alter table sessions add column if not exists user_agent       text;
alter table sessions add column if not exists screen_w         int;
alter table sessions add column if not exists screen_h         int;
alter table sessions add column if not exists meta             jsonb not null default '{}';

alter table events   add column if not exists instrument        text not null default 'rowdyrobo';
alter table events   add column if not exists tool              text;
alter table events   add column if not exists participant_code  text;
alter table events   add column if not exists device_id         text;
alter table events   add column if not exists support_condition text not null default 'na';

-- Rows written before `instrument` existed belong to RowdyRoboVac. The default
-- covers new inserts; this covers the old ones.
update sessions set instrument = 'rowdyrobo' where instrument is null;
update events   set instrument = 'rowdyrobo' where instrument is null;

-- ---------------------------------------------------------------------
-- Dedup. The one thing the durable queue relies on the database to get right:
-- a retry after a write that actually landed must be REJECTED, not duplicated.
--
-- These are PARTIAL indexes, one per instrument shape, rather than one index
-- over a COALESCE of everything. A single shared index would have had to treat
-- a null participant_code as a value, and then every RowdyRoboVac session row
-- — which has no code — would collide with every other one and the second
-- student of the day would silently fail to start.
-- ---------------------------------------------------------------------

-- An earlier version of this file created one. It is harmful now, for the
-- reason below, and re-running this file removes it.
drop index if exists sessions_dedup_code_idx;

-- Sessions need no extra index. `sessions.id` is the dedup key for BOTH
-- instruments: RowdyRoboVac generates one per run, and CTx3 derives one from
-- (instrument, participant code, device, day) so the same student on the same
-- device on the same day always addresses the same row. A separate unique
-- index on (code, device) would have been actively harmful -- it would have
-- rejected a CTx3 row whose derived id was new but whose code and device were
-- not, and every event pointing at that id would then have failed the
-- foreign key and been lost.

-- CTx3: one seq per code per device.
--
-- SCOPED TO CTx3 ON PURPOSE, and it has to be. RowdyRoboVac now sends a
-- participant code too, and it does NOT send a device_id. Without the
-- instrument clause its rows would fall into this index as
-- (rowdyrobo, ABC123, '', seq) — and because its seq counter restarts at 1 on
-- a device that has never played, the same student on a second machine would
-- collide with their own first machine's seq 1 and every event after it would
-- be rejected as a duplicate and silently lost. RowdyRoboVac dedups on the
-- session uuid instead, which is unique per run; see the index below.
--
-- The older, unscoped version of this index is dropped first, because
-- `create index if not exists` will not change the predicate of an index that
-- already exists.
drop index if exists events_dedup_code_idx;
create unique index if not exists events_dedup_code_idx on events
  (instrument, participant_code, coalesce(device_id, ''), seq)
  where participant_code is not null and instrument = 'ctx3';

-- RowdyRoboVac: one seq per session uuid.
create unique index if not exists events_dedup_session_idx on events
  (instrument, session_id, seq)
  where session_id is not null;

create index if not exists events_code_idx    on events (participant_code, instrument, seq);
create index if not exists events_tool_idx    on events (instrument, tool, type);
create index if not exists events_support_idx on events (support_condition);

-- ---------------------------------------------------------------------
-- Row-level security.
--
-- The anon/publishable key ships inside every client bundle and anyone can
-- read it from devtools. These policies grant INSERT only: without them one
-- student could read every other student's session — and now, every other
-- instrument's too, which is the one real cost of sharing a database. There
-- are deliberately no select/update/delete policies for anon. You read with
-- the service_role key from your own machine, never from an app.
-- ---------------------------------------------------------------------
-- Enable RLS only on relations that are actually TABLES.
--
-- This is a DO block rather than four plain ALTERs because `leaderboard`
-- turned out to be a view and the plain version died on it with 42809. A
-- schema file that has to be run against a database someone else's instrument
-- built should not assume it knows what kind of object a name refers to.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'                       -- ordinary tables only
      -- sessions and events only. `scores` is RowdyRoboVac's, it already
      -- works, and the leaderboard view depends on exactly how it is set up
      -- today -- so this file reads it in the checks below and changes
      -- nothing about it.
      and c.relname in ('sessions', 'events')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('drop policy if exists anon_insert_%I on public.%I', r.relname, r.relname);
    execute format(
      'create policy anon_insert_%I on public.%I for insert to anon with check (true)',
      r.relname, r.relname);
    raise notice 'RLS on, INSERT-only policy applied: %', r.relname;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- The participant roster.
--
-- Codes look like ABC123: three letters, three digits, printed on a card and
-- handed to a student. The same code identifies that student in VibeBuilder,
-- in CTx3 and in RowdyRoboVac, which is what makes the week join on one key.
--
-- WHY CODES, WHEN src/roster.js ARGUED AGAINST THEM
--
-- That file's case was: no card to lose, no code to mistype into an orphan
-- participant nobody can account for, and it matches RowdyRoboVac. Two of
-- those changed. Students now carry a card for VibeBuilder regardless, so the
-- card cost is paid either way; and the roster below is pre-seeded, so a
-- mistyped code is REJECTED at sign-in rather than becoming an orphan. What
-- the switch buys is the collision that file called unlikely-rather-than-
-- impossible: two students with the same first name and last initial are one
-- student to a name-derived pseudonym, and are two students to a code.
--
-- Names still go on the session row, exactly as before. The code is an
-- additional key, not a replacement for sign-in.
--
-- SEEDING. Codes are generated once, by VibeBuilder's generator:
--
--   node scripts/make-roster.js 30      (in the vibebuilder repo)
--
-- and the roster.sql it writes is run in BOTH Supabase projects — this one
-- and VibeBuilder's — so the same student has the same code in all three
-- tools. Generate once. Generating twice gives two different rosters and
-- silently breaks the join this whole file exists for.
-- ---------------------------------------------------------------------
create table if not exists students (
  username   text primary key,          -- ABC123
  role       text not null default 'student',   -- 'student' | 'instructor'
  cohort     text,                      -- optional: which camp/session
  created_at timestamptz not null default now()
);

alter table students add column if not exists role text not null default 'student';

-- The instructor key. KSS17 opens every tool in the week, and is a different
-- shape from a student code (three letters, two digits) so it can never
-- collide with a generated card. Its rows are real rows — exclude them in
-- analysis rather than assuming they are not there:
--
--   where participant_code <> 'KSS17'
insert into students (username, role) values ('KSS17', 'instructor')
on conflict (username) do update set role = 'instructor';

-- Same posture as every other table here: RLS on, no policies for anon, so
-- the roster cannot be read or enumerated from a browser. Validation happens
-- through the function below, which answers one yes/no question and hands
-- back no rows.
alter table students enable row level security;
revoke all on students from anon, authenticated;

-- ---------------------------------------------------------------------
-- Code validation, as a function rather than a read policy.
--
-- A client needs to answer "is this code real?" without being able to list
-- the roster. security definer runs the lookup as the function's owner, so
-- anon gets the boolean and never touches the table. This is the same
-- deviation the leaderboard view already makes, for the same reason: a
-- postgres-owned object is how something gets read back without exposing
-- what it reads from.
--
-- It is a guard against typos, not access control. Someone determined could
-- guess at the code space — and a guessed code buys them nothing they did not
-- already have, because the anon key can insert into sessions and events
-- regardless. Do not describe this to the IRB as authentication.
-- ---------------------------------------------------------------------
create or replace function check_roster(code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from students
    where username = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'))
  );
$$;

revoke all on function check_roster(text) from public;
grant execute on function check_roster(text) to anon;

-- ---------------------------------------------------------------------
-- DELIBERATELY NO FOREIGN KEY from sessions.participant_code to students.
--
-- It is the obvious next thought and it is a trap. A foreign key makes an
-- unseeded or misspelled code a HARD INSERT FAILURE, which means a student
-- whose code never made it into this table loses their entire session — the
-- one failure this study cannot absorb, because you cannot re-run a
-- participant. The client checks the roster and warns; if the check cannot be
-- reached, sign-in proceeds anyway, because a classroom with no network still
-- has to be able to run the study.
--
-- The cost is that a bad code can reach the data. Find them in analysis
-- rather than blocking on them at write time:
--
--   select distinct participant_code from sessions
--   where participant_code is not null
--     and participant_code not in (select username from students);
-- ---------------------------------------------------------------------

-- Confirm RLS is actually on. Every row must show rowsecurity = true.
--
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('sessions','events','scores');

-- The check that matters, and the one to re-run after ANY schema change.
-- Only INSERT policies may appear. A SELECT policy on sessions, events or
-- scores means one student can read another's data -- and now another
-- instrument's too, which is the one real cost of sharing a database.
--
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename, cmd;

-- Reading is supposed to happen through the leaderboard view and nowhere
-- else. Confirm no other view leaks a base table:
--
--   select table_name from information_schema.views
--   where table_schema = 'public';

-- ---------------------------------------------------------------------
-- RowdyRoboVac's leaderboard -- DELIBERATELY NOT TOUCHED
--
-- `leaderboard` is a VIEW, not a table. Rows go into an insert-only `scores`
-- table; the view projects display_name, score and created_at out of it and
-- nothing else, so the end screen can read scores back without `session_id`
-- ever being exposed. A view cannot have RLS enabled on it -- that is what
--
--   ERROR 42809: ALTER action ENABLE ROW SECURITY cannot be performed on
--   relation "leaderboard" / This operation is not supported for views
--
-- means, and an earlier version of this file tried to do exactly that. The
-- view is already built, already correct, and belongs to RowdyRoboVac. CTx3
-- neither reads nor writes it. Leave it alone.
--
-- The consequence for this database is the one thing worth carrying forward:
-- readable data exists here, via that view. So the check below is not
-- "nothing is readable", it is "only the leaderboard view is".
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Migrating a further instrument into this database
-- ---------------------------------------------------------------------
-- Mosaic and Manifest key events on a session uuid and carry identifying
-- fields on the session row, so they already fit: set `instrument`, and put
-- anything this shape does not carry into `meta`. Until they move, their tiles
-- link out and the join happens at analysis time on the participant code,
-- exactly as ARCHITECTURE.md says.
--
--   insert into sessions (instrument, participant_code, day, first_name,
--                         last_initial, grade, meta)
--   select 'manifest', s.participant_code, 4, s.first_name, s.last_initial,
--          s.grade, jsonb_build_object('arm', s.arm)
--   from legacy_manifest_sessions s;

-- ---------------------------------------------------------------------
-- Starter analysis queries (service_role key, from your own machine)
-- ---------------------------------------------------------------------

-- The roster view a researcher wants on a study day: which code belongs to
-- which packet. The ONLY query that should return a name.
--
--   select participant_code, first_name, last_initial, instrument, started_at
--   from sessions order by started_at;

-- Confirm no name ever reached an event. This must return zero. If it does
-- not, something wrote an identifying field into a payload and the client-side
-- scrub in src/lib/supabase.js did not catch it.
--
--   select count(*) from events
--   where payload::text ~* '(first_?name|last_?initial|"grade")';

-- Which instrument wrote what. The sanity check to run first, every time.
--
--   select instrument, tool, count(*) from events group by 1,2 order by 1,2;

-- The join that one database exists for: every instrument, one student.
--
--   select participant_code, instrument, tool,
--          min(server_ts) as started, max(server_ts) as ended,
--          count(*) filter (where type = 'attempt_submitted') as attempts
--   from events where participant_code is not null
--   group by 1,2,3 order by participant_code, started;

-- RowdyRoboVac's rows carry no participant code yet, so they join through the
-- session row instead. Once the ?pc= retrofit lands they join directly.
--
--   select s.participant_code, s.first_name, s.last_initial,
--          count(e.*) as events
--   from sessions s left join events e on e.session_id = s.id
--   where s.instrument = 'rowdyrobo' group by 1,2,3;

-- The primary outcome. highestStepReached lands on phase_complete; the range
-- is the high-support figure minus the low-support one, per tool.
--
--   with phases as (
--     select participant_code, tool, support_condition,
--            (payload->>'highestStepReached')::int as step
--     from events where type = 'phase_complete'
--   )
--   select participant_code, tool,
--          max(step) filter (where support_condition = 'high') as optimal,
--          max(step) filter (where support_condition = 'low')  as functional,
--          max(step) filter (where support_condition = 'high')
--        - max(step) filter (where support_condition = 'low')  as developmental_range
--   from phases group by 1,2 order by 1;

-- The comparison responses — the highest-value artifact in the pilot, and the
-- input to the S/F/R/N coding scheme in EVENTS.md.
--
--   select participant_code, payload->>'text' as response
--   from events where type = 'comparison_response' order by participant_code;

-- Variance held constant by construction (Word4Word's projector cells).
--
--   select payload->>'quadrant' as quadrant, count(*) as runs,
--          count(*) filter (where (payload->>'sameAsRun1')::boolean is false) as differed,
--          count(*) filter (where (payload->>'matched')::boolean) as built_it
--   from events where type = 'run_executed' group by 1;

-- Decomposition, per student (Word4Word's hands-on phase).
--
--   select participant_code,
--          count(*) as tries,
--          count(*) filter (where (payload->>'numbered')::boolean) as numbered_tries,
--          bool_or((payload->>'matched')::boolean) as ever_built_it
--   from events where tool = 'word4word' and type = 'instruction_executed'
--     and participant_code is not null
--   group by 1 order by 1;

-- Deleting the identifying fields once packets are matched to codes. Put the
-- date on your calendar the day you deploy; it belongs on the consent form.
--
--   update sessions set first_name = null, last_initial = null, grade = null;
