-- Run this in Supabase SQL Editor
create table if not exists feedback (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users on delete set null,
  type        text        not null check (type in ('Bug','Suggestion','General')),
  message     text        not null,
  context     text,
  screenshot  text,
  created_at  timestamptz default now()
);

alter table feedback enable row level security;

create policy "Users can submit feedback"
  on feedback for insert
  with check (auth.uid() = user_id or user_id is null);
