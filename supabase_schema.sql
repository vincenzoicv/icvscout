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
