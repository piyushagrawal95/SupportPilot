-- CloudNotes Notes Table Migration
create table if not exists notes (
  id bigserial primary key,
  user_id uuid not null,
  title text not null default 'Untitled',
  body text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_user on notes (user_id, pinned desc, updated_at desc);
