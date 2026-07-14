-- ICV Scout automation schema
-- Esegui questo SQL nel pannello Supabase prima di usare il nuovo admin.

create table if not exists public.news (
  id bigserial primary key,
  title text not null,
  body text not null,
  category text not null default 'juventus',
  urgency text not null default 'normal',
  source text,
  source_url text,
  visible boolean not null default true,
  auto_fetched boolean not null default false,
  reliability text not null default 'trusted',
  editorial_status text not null default 'Confermato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.news
  add column if not exists source_url text,
  add column if not exists reliability text default 'trusted',
  add column if not exists editorial_status text default 'Confermato';

create table if not exists public.sources (
  id bigserial primary key,
  name text not null,
  url text not null,
  category text not null default 'juventus',
  reliability text not null default 'trusted',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.news_drafts (
  id bigserial primary key,
  title text not null,
  body text not null,
  category text not null default 'juventus',
  urgency text not null default 'normal',
  source_name text,
  source_url text,
  reliability text not null default 'trusted',
  editorial_status text not null default 'Confermato',
  review_status text not null default 'needs_review',
  editorial_note text,
  content_hash text unique,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_items (
  id bigserial primary key,
  player_name text not null,
  role text,
  club text,
  category text not null default 'calciomercato',
  status text not null default 'monitorato',
  source_name text,
  source_url text,
  reliability text not null default 'rumor',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_reports (
  id bigserial primary key,
  match_id text unique,
  opponent text,
  competition text,
  match_date timestamptz,
  status text not null default 'pre_match',
  title text,
  summary text,
  tactical_key text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_drafts (
  id bigserial primary key,
  news_id bigint references public.news(id) on delete cascade,
  platform text not null default 'instagram',
  hook text,
  caption text,
  card_text text,
  post_url text,
  media_type text not null default 'post',
  instagram_id text,
  media_url text,
  thumbnail_url text,
  published_at timestamptz,
  visible boolean not null default true,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_drafts add column if not exists post_url text;
alter table public.social_drafts add column if not exists media_type text not null default 'post';
alter table public.social_drafts add column if not exists instagram_id text;
alter table public.social_drafts add column if not exists media_url text;
alter table public.social_drafts add column if not exists thumbnail_url text;
alter table public.social_drafts add column if not exists published_at timestamptz;
alter table public.social_drafts add column if not exists visible boolean not null default true;

create table if not exists public.automation_runs (
  id bigserial primary key,
  type text not null,
  status text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_news_drafts_review on public.news_drafts(review_status, created_at desc);
create index if not exists idx_news_visible on public.news(visible, created_at desc);
create index if not exists idx_social_visible on public.social_drafts(platform, visible, created_at desc);
create index if not exists idx_automation_runs_type on public.automation_runs(type, created_at desc);

insert into public.sources (name, url, category, reliability, active)
values
  ('Juventus ufficiale', 'https://news.google.com/rss/search?q=site%3Ajuventus.com%2Fit%2Fnews%20Juventus&hl=it&gl=IT&ceid=IT:it', 'juventus', 'official', true),
  ('Sky Sport Juventus', 'https://news.google.com/rss/search?q=Juventus%20Sky%20Sport&hl=it&gl=IT&ceid=IT:it', 'juventus', 'trusted', true),
  ('Di Marzio Juventus', 'https://news.google.com/rss/search?q=Juventus%20Di%20Marzio&hl=it&gl=IT&ceid=IT:it', 'calciomercato', 'trusted', true),
  ('Il Bianconero', 'https://feeds.footballco.com/ilbianconero/feed/x2mb7fql9vce6t1p', 'juventus', 'trusted', true),
  ('Google News mercato', 'https://news.google.com/rss/search?q=Juventus%20calciomercato&hl=it&gl=IT&ceid=IT:it', 'calciomercato', 'aggregator', true)
on conflict do nothing;

-- ICV Community ------------------------------------------------------------
-- Profili, discussioni e interazioni della community bianconera.

create table if not exists public.community_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  quiz_badge text default 'Bianconero',
  role text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  category text not null default 'per_te' check (category in ('per_te', 'mercato', 'partite', 'analisi')),
  body text not null check (char_length(body) between 1 and 1200),
  image_url text,
  is_official boolean not null default false,
  status text not null default 'published' check (status in ('published', 'hidden', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

-- Consente discussioni anche sotto le news ufficiali ICV.
alter table public.community_comments alter column post_id drop not null;
alter table public.community_comments add column if not exists news_id bigint references public.news(id) on delete cascade;
alter table public.community_comments drop constraint if exists community_comments_target_check;
alter table public.community_comments add constraint community_comments_target_check
  check ((post_id is not null and news_id is null) or (post_id is null and news_id is not null));

create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  type text not null default 'like' check (type in ('like')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, type)
);

create table if not exists public.community_saves (
  id bigserial primary key,
  post_id uuid references public.community_posts(id) on delete cascade,
  news_id bigint references public.news(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((post_id is not null)::integer + (news_id is not null)::integer = 1)
);
create unique index if not exists community_saves_post_user_unique on public.community_saves(post_id, user_id) where post_id is not null;
create unique index if not exists community_saves_news_user_unique on public.community_saves(news_id, user_id) where news_id is not null;

create table if not exists public.community_follows (
  follower_id uuid not null references public.community_profiles(id) on delete cascade,
  following_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.community_profiles(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);

create index if not exists idx_community_posts_feed on public.community_posts(status, category, created_at desc);
create index if not exists idx_community_comments_post on public.community_comments(post_id, status, created_at asc);
create index if not exists idx_community_comments_news on public.community_comments(news_id, status, created_at asc);
create index if not exists idx_community_reactions_post on public.community_reactions(post_id, type);
create index if not exists idx_community_follows_following on public.community_follows(following_id);

alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_saves enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists "community profiles public read" on public.community_profiles;
create policy "community profiles public read" on public.community_profiles for select using (status = 'active');
drop policy if exists "community posts public read" on public.community_posts;
create policy "community posts public read" on public.community_posts for select using (status = 'published');
drop policy if exists "community comments public read" on public.community_comments;
create policy "community comments public read" on public.community_comments for select using (status = 'published');

create or replace function public.create_icv_community_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.community_profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    'icv_' || substr(replace(new.id::text, '-', ''), 1, 10),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'Bianconero'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_icv_community_profile_after_signup on auth.users;
create trigger create_icv_community_profile_after_signup
after insert on auth.users for each row execute procedure public.create_icv_community_profile();

-- Funzioni Community per il lancio pubblico (migrazione idempotente).
alter table public.community_profiles add column if not exists suspension_reason text;
alter table public.community_profiles add column if not exists suspended_until timestamptz;
alter table public.community_profiles add column if not exists last_seen_at timestamptz;
alter table public.community_comments add column if not exists parent_id uuid references public.community_comments(id) on delete cascade;
alter table public.community_comments add column if not exists updated_at timestamptz not null default now();

create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.community_profiles(id) on delete cascade,
  actor_id uuid references public.community_profiles(id) on delete cascade, type text not null check (type in ('comment','reply','like','follow','mention','moderation')),
  post_id uuid references public.community_posts(id) on delete cascade, comment_id uuid references public.community_comments(id) on delete cascade,
  news_id bigint references public.news(id) on delete cascade, text text not null default '', read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.community_blocks (
  blocker_id uuid not null references public.community_profiles(id) on delete cascade, blocked_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create table if not exists public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(), moderator_label text not null default 'ICV Admin', target_user_id uuid references public.community_profiles(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete set null, comment_id uuid references public.community_comments(id) on delete set null,
  action text not null, reason text, created_at timestamptz not null default now()
);
create table if not exists public.community_activity (
  id bigint generated always as identity primary key, user_id uuid not null references public.community_profiles(id) on delete cascade,
  action text not null, fingerprint text, created_at timestamptz not null default now()
);
create index if not exists idx_community_comments_parent on public.community_comments(parent_id, status, created_at);
create index if not exists idx_community_notifications_user on public.community_notifications(user_id, read_at, created_at desc);
create index if not exists idx_community_moderation_actions_created on public.community_moderation_actions(created_at desc);
create index if not exists idx_community_activity_limit on public.community_activity(user_id, action, created_at desc);
alter table public.community_notifications enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_moderation_actions enable row level security;
alter table public.community_activity enable row level security;
drop policy if exists "community notifications own read" on public.community_notifications;
create policy "community notifications own read" on public.community_notifications for select using (auth.uid() = user_id);
drop policy if exists "community blocks own read" on public.community_blocks;
create policy "community blocks own read" on public.community_blocks for select using (auth.uid() = blocker_id);
