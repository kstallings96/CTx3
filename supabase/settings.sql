-- Which tiles are open, for everybody.
--
-- Run this once in the Supabase SQL editor. Until you do, the admin page
-- still works — it just saves to the browser you are sitting at, so you
-- would have to set it on all fourteen Chromebooks. With this table it is
-- one change on one device and the room follows.
--
-- Idempotent: running it twice changes nothing.

-- NULL AND '{}' ARE DIFFERENT ANSWERS, so the column is nullable on purpose.
--
--   null   nobody has overridden anything; each device uses the day
--          defaults in src/tiles.js, and the week runs on its own
--   '{}'   the facilitator deliberately closed everything
--   {...}  exactly these tiles are open, whatever day it is
--
-- Collapsing the first two into one value is the obvious simplification and
-- it is wrong in the direction that costs a period: "I have not set this up
-- yet" would arrive at every Chromebook as "nothing opens today".
create table if not exists settings (
  instrument  text primary key,
  open_tiles  text[],
  updated_at  timestamptz not null default now()
);

alter table settings enable row level security;

-- READABLE BY EVERYONE. Every student's device has to be able to ask what is
-- open, and there is nothing in this table worth hiding: it is a list of tile
-- names. No student row, no name, no answer ever lands here.
drop policy if exists settings_read on settings;
create policy settings_read on settings
  for select to anon using (true);

-- WRITABLE BY EVERYONE TOO, AND YOU SHOULD KNOW THAT.
--
-- The admin password is checked in the browser, not here, so this policy is
-- what actually stands between a determined student and the tile list. It is
-- a speed bump, exactly like the passwords in src/passwords.js, and for the
-- same reason: the anon key ships in the bundle, so anything it can do, a
-- student who reads the bundle can do.
--
-- It is written this way on purpose rather than by oversight. The worst
-- outcome is a tile opening early, which is a classroom-management annoyance
-- you would notice within a minute. Weigh that against a security-definer
-- function that would have to carry the admin word in SQL — where it would
-- sit in this file, in the repo, in plain text — and the speed bump wins.
--
-- NOTHING STUDY-CRITICAL IS IN HERE. No session, event or answer can be
-- reached through this policy; `events` and `sessions` are insert-only and
-- unaffected. If that ever stops being true, this policy has to be revisited
-- before the table gains a column.
drop policy if exists settings_write on settings;
create policy settings_write on settings
  for insert to anon with check (instrument = 'ctx3');

drop policy if exists settings_update on settings;
create policy settings_update on settings
  for update to anon using (instrument = 'ctx3') with check (instrument = 'ctx3');

-- The starting row: open_tiles null, so the day defaults in src/tiles.js
-- apply until you touch the admin page.
insert into settings (instrument, open_tiles) values ('ctx3', null)
on conflict (instrument) do nothing;

select instrument, open_tiles, updated_at from settings;
