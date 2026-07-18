-- CPA Audit Workspace — user-scoped resume storage (Phase 2)
-- Run this entire file in Supabase Dashboard → SQL Editor
-- Requires: Supabase Auth (Google OAuth) enabled

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Table: workspaces
-- One row per (user, document) = one resume record per exam PDF per user
-- document_key = SHA-256 hex of PDF bytes (documentId in app code)
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_key text not null,
  document_name text,
  answer_data jsonb not null default '{}'::jsonb,
  workspace_state jsonb not null default '{}'::jsonb,
  annotation_data jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspaces_user_document_key unique (user_id, document_key)
);

comment on table public.workspaces is
  'Per-user exam workspace resume data (answers + state + annotations).';

comment on column public.workspaces.document_key is
  'Stable PDF identity: SHA-256 hex of PDF bytes (app documentId).';

comment on column public.workspaces.answer_data is
  'Answer pages and editor resume fields. Expected keys: answerSheet, answerSheetPage, caretOffset, circledNumberSession.';

comment on column public.workspaces.workspace_state is
  'Resume UI/state. Expected keys: timerSeconds, timerDurationSeconds, timerRemainingSeconds, answerFontSize, answerLetterSpacing, currentPage, pageViews, bookmarks, memo, tags, status, searchQuery.';

comment on column public.workspaces.annotation_data is
  'Draw annotations for exam/answer surfaces. Expected key: drawAnnotations.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists workspaces_user_id_idx
  on public.workspaces (user_id);

create index if not exists workspaces_user_document_key_idx
  on public.workspaces (user_id, document_key);

create index if not exists workspaces_updated_at_idx
  on public.workspaces (updated_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_workspaces_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;

-- SELECT: authenticated users can read only their rows
drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
on public.workspaces
for select
to authenticated
using (auth.uid() = user_id);

-- INSERT: authenticated users can insert only rows owned by themselves
drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own"
on public.workspaces
for insert
to authenticated
with check (auth.uid() = user_id);

-- UPDATE: authenticated users can update only their rows
drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own"
on public.workspaces
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- DELETE: authenticated users can delete only their rows
drop policy if exists "workspaces_delete_own" on public.workspaces;
create policy "workspaces_delete_own"
on public.workspaces
for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Optional: grant table access to authenticated role (Supabase default)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.workspaces to authenticated;
