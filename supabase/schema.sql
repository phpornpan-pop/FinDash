-- Networth Ledger — Supabase schema
-- -----------------------------------
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard > SQL Editor > New query > paste this whole file > Run).
--
-- Creates one table that stores each signed-in user's entire ledger as a
-- single JSON blob (same shape the app already uses for localStorage),
-- with Row Level Security so a user can only ever read or write their own row.

create table if not exists ledger_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table ledger_data enable row level security;

-- a user can read only their own row
create policy "Users can read own ledger"
  on ledger_data for select
  using (auth.uid() = user_id);

-- a user can insert only a row for themselves
create policy "Users can insert own ledger"
  on ledger_data for insert
  with check (auth.uid() = user_id);

-- a user can update only their own row
create policy "Users can update own ledger"
  on ledger_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- (optional) a user can delete only their own row
create policy "Users can delete own ledger"
  on ledger_data for delete
  using (auth.uid() = user_id);
