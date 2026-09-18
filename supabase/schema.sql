-- The study database — one Supabase project for every instrument in the week.
-- Run once in the SQL editor. Safe to re-run: every statement is guarded.
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
-- `tool` (which activity inside that app). Both are in the unique keys —
-- without that, two instruments on the same device would both start at seq 1
-- and the second one's rows would be rejected as duplicates and silently lost.

create table if not exists sessions (
  id bigserial primary key,
  instrument text not null,            -- 'ctx3' | 'mosaic' | 'manifest' | 'rowdyrobo'
  -- RowdyRoboVac keys its events on a session uuid rather than a code+device
  -- pair, and it already ships a working queue. Rather than rewrite a deployed
  -- Godot build, the table carries both shapes and the dedup key covers both.
  session_id uuid,
  participant_code text,
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
  instrument text not null,
  tool text,                           -- the activity inside the instrument
  session_id uuid,                     -- RowdyRoboVac's shape
  participant_code text,               -- null on whole-class rows, by design
  device_id text,
  seq int not null,
  type text not null,
  -- high | low | na. Every event carries it; the developmental-range framework
  -- depends on being able to split any analysis by condition.
  support_condition text not null default 'na',
  payload jsonb not null default '{}',
  client_ts timestamptz not null,
  server_ts timestamptz not null default now()
);

-- The dedup keys, as unique INDEXES with COALESCE rather than plain
-- constraints. Postgres treats NULLs as distinct in a unique constraint, so a
-- whole-class row (no participant code) or a device with no id would never
-- collide -- and a retry after a write that actually landed would insert a
-- second copy instead of being rejected. That is the one thing the durable
-- queue relies on the database to get right.
create unique index if not exists sessions_dedup_idx on sessions
  (instrument, coalesce(participant_code, ''), coalesce(device_id, ''), coalesce(session_id::text, ''));
create unique index if not exists events_dedup_idx on events
  (instrument, coalesce(participant_code, ''), coalesce(device_id, ''),
   coalesce(session_id::text, ''), seq);
create index if not exists events_code_idx    on events (participant_code, instrument, seq);
create index if not exists events_tool_idx    on events (instrument, tool, type);
create index if not exists events_support_idx on events (support_condition);

-- ---------------------------------------------------------------------
-- Row-level security.
--
-- The anon key ships inside every client bundle and anyone can read it from
-- devtools. These policies grant INSERT only: without them one student could
-- read every other student's session — and now, every other instrument's too,
-- which is the one real cost of sharing a database. There are deliberately no
-- select/update/delete policies for anon. You read with the service_role key
-- from your own machine, never from an app.
-- ---------------------------------------------------------------------
alter table sessions enable row level security;
alter table events   enable row level security;

drop policy if exists anon_insert_sessions on sessions;
create policy anon_insert_sessions on sessions for insert to anon with check (true);

drop policy if exists anon_insert_events on events;
create policy anon_insert_events on events for insert to anon with check (true);

-- Confirm RLS is actually on. Both rows must show rowsecurity = true.
--
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('sessions','events');

-- ---------------------------------------------------------------------
-- RowdyRoboVac's leaderboard
--
-- RowdyRoboVac reads a leaderboard with the anon key, so this database is no
-- longer insert-only across the board. Keep that exception narrow and
-- deliberate: SELECT is granted on THIS TABLE ONLY, it holds nothing but a
-- display name and a score, and no policy anywhere grants select on sessions
-- or events. Check that after every schema change.
-- ---------------------------------------------------------------------
create table if not exists leaderboard (
  id bigserial primary key,
  display_name text not null,
  score int not null,
  created_at timestamptz not null default now()
);
alter table leaderboard enable row level security;

drop policy if exists anon_insert_leaderboard on leaderboard;
create policy anon_insert_leaderboard on leaderboard for insert to anon with check (true);

drop policy if exists anon_read_leaderboard on leaderboard;
create policy anon_read_leaderboard on leaderboard for select to anon using (true);

-- The check that matters once a read policy exists anywhere. Only
-- leaderboard/SELECT may appear:
--
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename, cmd;

-- ---------------------------------------------------------------------
-- Migrating an existing instrument into this database
-- ---------------------------------------------------------------------
-- Mosaic and Manifest currently key events on a session uuid and carry
-- identifying fields on the session row. Neither has to change shape to move
-- here: add `instrument`, move the identifying columns into `meta`, and keep
-- writing. Until then their tiles link out and the join happens at analysis
-- time on the participant code, exactly as ARCHITECTURE.md says.
--
--   insert into sessions (instrument, participant_code, device_id, day, meta)
--   select 'manifest', s.participant_code, null, 4,
--          jsonb_build_object('first_name', s.first_name,
--                             'last_initial', s.last_initial,
--                             'grade', s.grade, 'arm', s.arm)
--   from legacy_manifest_sessions s;

-- ---------------------------------------------------------------------
-- Starter analysis queries (service_role key, from your own machine)
-- ---------------------------------------------------------------------

-- The roster view a researcher actually wants on a study day: which code
-- belongs to which packet. The ONLY query that should return a name.
--
--   select participant_code, first_name, last_initial, instrument, started_at
--   from sessions order by started_at;

-- Confirm no name ever reached an event. This should return zero rows; if it
-- does not, something wrote an identifying field into a payload and the
-- client-side scrub in src/lib/supabase.js did not catch it.
--
--   select count(*) from events
--   where payload::text ~* '(first_?name|last_?initial|"grade")';

-- The join that one database exists for: every instrument, one student.
--
--   select participant_code, instrument, tool,
--          min(server_ts) as started, max(server_ts) as ended,
--          count(*) filter (where type = 'attempt_submitted') as attempts
--   from events group by 1,2,3 order by participant_code, started;

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
