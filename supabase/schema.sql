-- ── GlowIQ Consumer — Supabase Schema ────────────────────────────────────────
-- Run this entire file in: Supabase project → SQL Editor → New query → Run

-- Enable Row Level Security on all tables (Supabase default, but explicit is safer)

-- ── user_storage ──────────────────────────────────────────────────────────────
-- Single key-value table that mirrors the window.storage API exactly.
-- Personal rows (is_shared=false) are scoped to the user.
-- Shared rows (is_shared=true) have no user_id — visible to all authenticated users.

create table if not exists user_storage (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  key         text        not null,
  value       text        not null,
  is_shared   boolean     not null default false,
  updated_at  timestamptz not null default now()
);

-- Unique constraints
create unique index if not exists user_storage_personal_key
  on user_storage (user_id, key)
  where is_shared = false and user_id is not null;

create unique index if not exists user_storage_shared_key
  on user_storage (key)
  where is_shared = true;

-- Row Level Security
alter table user_storage enable row level security;

-- Personal rows: owner can read/write/delete their own
create policy "Users can read their own storage"
  on user_storage for select
  using (auth.uid() = user_id or is_shared = true);

create policy "Users can insert their own storage"
  on user_storage for insert
  with check (auth.uid() = user_id or is_shared = true);

create policy "Users can update their own storage"
  on user_storage for update
  using (auth.uid() = user_id or is_shared = true);

create policy "Users can delete their own storage"
  on user_storage for delete
  using (auth.uid() = user_id or is_shared = true);

-- Index for fast lookups
create index if not exists user_storage_user_key
  on user_storage (user_id, key);
