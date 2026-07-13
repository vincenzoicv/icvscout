-- ICV Community: social discovery, polls, reposts and trusted context.

alter table public.community_posts
  add column if not exists quote_post_id uuid references public.community_posts(id) on delete set null,
  add column if not exists poll_question text,
  add column if not exists poll_options jsonb,
  add column if not exists poll_ends_at timestamptz,
  add column if not exists scheduled_at timestamptz;

create table if not exists public.community_poll_votes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_reposts (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_notification_preferences (
  user_id uuid primary key references public.community_profiles(id) on delete cascade,
  replies boolean not null default true,
  mentions boolean not null default true,
  reactions boolean not null default true,
  follows boolean not null default true,
  official_news boolean not null default true,
  match_room boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_muted_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  word text not null check (char_length(word) between 2 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, word)
);

create table if not exists public.community_context_notes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  news_id bigint references public.news(id) on delete cascade,
  author_id uuid not null references public.community_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 20 and 600),
  source_url text,
  reliability text not null default 'verified' check (reliability in ('official','verified','developing','rumor')),
  status text not null default 'published' check (status in ('published','hidden','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((post_id is not null and news_id is null) or (post_id is null and news_id is not null))
);

create index if not exists idx_community_posts_quote on public.community_posts(quote_post_id);
create index if not exists idx_community_posts_scheduled on public.community_posts(status, scheduled_at, created_at desc);
create index if not exists idx_community_poll_votes_post on public.community_poll_votes(post_id, option_index);
create index if not exists idx_community_reposts_post on public.community_reposts(post_id, created_at desc);
create index if not exists idx_community_muted_words_user on public.community_muted_words(user_id);
create index if not exists idx_community_context_notes_post on public.community_context_notes(post_id, status, created_at desc);

alter table public.community_poll_votes enable row level security;
alter table public.community_reposts enable row level security;
alter table public.community_notification_preferences enable row level security;
alter table public.community_muted_words enable row level security;
alter table public.community_context_notes enable row level security;

drop policy if exists "community context notes public read" on public.community_context_notes;
create policy "community context notes public read" on public.community_context_notes for select using (status = 'published');
drop policy if exists "community preferences own read" on public.community_notification_preferences;
create policy "community preferences own read" on public.community_notification_preferences for select using (auth.uid() = user_id);
drop policy if exists "community muted words own read" on public.community_muted_words;
create policy "community muted words own read" on public.community_muted_words for select using (auth.uid() = user_id);

alter table public.community_notifications drop constraint if exists community_notifications_type_check;
alter table public.community_notifications add constraint community_notifications_type_check
  check (type in ('comment','reply','like','follow','mention','moderation','repost','quote','poll','official_news','match_room'));
