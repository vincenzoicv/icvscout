-- Community ICV: infrastruttura completa per lancio pubblico.

alter table public.community_profiles add column if not exists suspension_reason text;
alter table public.community_profiles add column if not exists suspended_until timestamptz;
alter table public.community_profiles add column if not exists last_seen_at timestamptz;

alter table public.community_comments add column if not exists parent_id uuid references public.community_comments(id) on delete cascade;
alter table public.community_comments add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_community_comments_parent on public.community_comments(parent_id, status, created_at);

create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  actor_id uuid references public.community_profiles(id) on delete cascade,
  type text not null check (type in ('comment','reply','like','follow','mention','moderation')),
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  news_id bigint references public.news(id) on delete cascade,
  text text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_notifications_user on public.community_notifications(user_id, read_at, created_at desc);

create table if not exists public.community_blocks (
  blocker_id uuid not null references public.community_profiles(id) on delete cascade,
  blocked_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_label text not null default 'ICV Admin',
  target_user_id uuid references public.community_profiles(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete set null,
  comment_id uuid references public.community_comments(id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_moderation_actions_created on public.community_moderation_actions(created_at desc);

create table if not exists public.community_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  action text not null,
  fingerprint text,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_activity_limit on public.community_activity(user_id, action, created_at desc);

alter table public.community_notifications enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_moderation_actions enable row level security;
alter table public.community_activity enable row level security;

drop policy if exists "community notifications own read" on public.community_notifications;
create policy "community notifications own read" on public.community_notifications for select using (auth.uid() = user_id);
drop policy if exists "community blocks own read" on public.community_blocks;
create policy "community blocks own read" on public.community_blocks for select using (auth.uid() = blocker_id);
