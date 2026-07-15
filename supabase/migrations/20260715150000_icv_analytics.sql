-- ICV Analytics: telemetria proprietaria, anonima e senza indirizzi IP.
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in (
    'page_view', 'navigation', 'outbound_click',
    'community_post', 'community_comment', 'community_reaction',
    'community_repost', 'community_save', 'community_follow',
    'community_report', 'community_match_message',
    'quiz_result', 'newsletter_subscribe'
  )),
  session_id text not null check (char_length(session_id) between 12 and 80),
  path text not null default '/',
  page_type text not null default 'site',
  source text not null default 'direct',
  referrer_host text,
  campaign text,
  device_type text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_created on public.analytics_events(created_at desc);
create index if not exists idx_analytics_events_session on public.analytics_events(session_id, created_at desc);
create index if not exists idx_analytics_events_path on public.analytics_events(path, created_at desc);
create index if not exists idx_analytics_events_source on public.analytics_events(source, created_at desc);
create index if not exists idx_analytics_events_name on public.analytics_events(event_name, created_at desc);

alter table public.analytics_events enable row level security;
-- Nessuna policy pubblica: scrittura e lettura passano esclusivamente dalla Pages Function.

