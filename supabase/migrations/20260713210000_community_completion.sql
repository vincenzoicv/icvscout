create table if not exists public.community_match_messages (
  id uuid primary key default gen_random_uuid(),
  match_key text not null,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 400),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

create index if not exists idx_community_match_messages_room
  on public.community_match_messages(match_key, status, created_at desc);

alter table public.community_match_messages enable row level security;

drop policy if exists "community match room public read" on public.community_match_messages;
create policy "community match room public read"
  on public.community_match_messages for select
  using (status = 'published');

drop policy if exists "community match room own write" on public.community_match_messages;
create policy "community match room own write"
  on public.community_match_messages for insert
  with check (auth.uid() = user_id);
