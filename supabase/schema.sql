-- CTx3 — database schema
-- Run once in the Supabase SQL editor. Safe to re-run: every statement is guarded.
--
-- Same shape as Manifest and Mosaic (sessions + append-only events, insert-only
-- RLS) with one deliberate difference: CTx3 stores NO identifying fields. The
-- participant code is the only identifier and the roster mapping codes to
-- students lives on paper with the research team (ARCHITECTURE.md).

create table if not exists sessions (
  id bigserial primary key,
  participant_code text not null,
  device_id text,
  day int,
  user_agent text,
  screen_w int,
  screen_h int,
  started_at timestamptz not null default now(),
  unique (participant_code, device_id)
);

create table if not exists events (
  id bigserial primary key,
  participant_code text,
  device_id text,
  seq int not null,
  tool text,
  type text not null,
  -- high | low | na. Every event carries it; the whole developmental-range
  -- framework depends on being able to split any analysis by condition.
  support_condition text not null default 'na',
  payload jsonb not null default '{}',
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  unique (participant_code, device_id, seq)
);

create index if not exists events_code_seq_idx on events (participant_code, seq);
create index if not exists events_tool_idx     on events (tool, type);
create index if not exists events_support_idx  on events (support_condition);

-- ---------------------------------------------------------------------
-- Row-level security.
--
-- The anon key ships inside the client bundle and anyone can read it from
-- devtools. These policies grant INSERT only: without them one student could
-- read every other student's session. There are deliberately no
-- select/update/delete policies for anon — you read the data with the
-- service_role key from your own machine, never from the app.
-- ---------------------------------------------------------------------
alter table sessions enable row level security;
alter table events   enable row level security;

drop policy if exists anon_insert_sessions on sessions;
create policy anon_insert_sessions on sessions for insert to anon with check (true);

drop policy if exists anon_insert_events on events;
create policy anon_insert_events on events for insert to anon with check (true);

-- Confirm RLS is actually on. Both rows must show rowsecurity = true; if they
-- do not, students can read each other's data.
--
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('sessions','events');

-- ---------------------------------------------------------------------
-- Starter analysis queries (run with the service_role key, from your machine)
-- ---------------------------------------------------------------------

-- One row per participant per tool: did they finish, and how long did it take.
--
--   select participant_code, tool,
--          min(server_ts) as started,
--          max(server_ts) as ended,
--          count(*) filter (where type = 'attempt_submitted') as attempts
--   from events group by participant_code, tool order by participant_code;

-- The primary outcome. highestStepReached lands on phase_complete; the range
-- is the high-support figure minus the low-support one, per tool.
--
--   with phases as (
--     select participant_code, tool,
--            payload->>'phaseId'                     as phase_id,
--            support_condition,
--            (payload->>'highestStepReached')::int   as step
--     from events where type = 'phase_complete'
--   )
--   select participant_code, tool,
--          max(step) filter (where support_condition = 'high') as optimal,
--          max(step) filter (where support_condition = 'low')  as functional,
--          max(step) filter (where support_condition = 'high')
--        - max(step) filter (where support_condition = 'low')  as developmental_range
--   from phases group by participant_code, tool order by participant_code;

-- The comparison responses — the highest-value artifact in the pilot, and the
-- input to the S/F/R/N coding scheme in EVENTS.md.
--
--   select participant_code, payload->>'text' as response
--   from events where type = 'comparison_response' order by participant_code;

-- Variance actually observed, held constant by construction (Two Machines).
--
--   select payload->>'quadrant' as quadrant,
--          count(*) as runs,
--          count(*) filter (where (payload->>'sameAsRun1')::boolean is false) as differed
--   from events where type = 'run_executed' group by 1;
