create table public.privacy_receipts (
  id uuid primary key,
  version integer not null check (version = 3),
  action text not null check (action in ('accept', 'reject', 'customize', 'media')),
  analytics boolean not null,
  external_media boolean not null,
  chosen_at timestamptz not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  notice jsonb not null,
  check (action <> 'reject' or (not analytics and not external_media))
);
create index privacy_receipts_expiry on public.privacy_receipts(expires_at);
alter table public.privacy_receipts enable row level security;
revoke all on public.privacy_receipts from anon, authenticated;
grant select, insert, delete on public.privacy_receipts to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('icv-privacy-receipts-retention', '17 3 * * *',
  $$delete from public.privacy_receipts where expires_at < now()$$);
