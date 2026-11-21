-- WebExpoSyn: scan history and verified domains
--
-- Security model
--   * Reports are WRITTEN only by the API server, using the server-side
--     secret key (which bypasses RLS). Users can never insert or edit a
--     report, so nobody can forge a clean result for their site.
--   * Signed-in users can READ and DELETE only their own rows (RLS).
--   * The anon role gets no access at all.
--
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to re-run.

-- ---------------------------------------------------------------------------
-- scans: one row per completed assessment
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id                 uuid primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  hostname           text not null check (char_length(hostname) between 1 and 253),
  domain             text not null check (char_length(domain) between 1 and 253),
  url                text not null check (char_length(url) <= 2048),
  ownership_verified boolean not null default false,
  started_at         timestamptz not null,
  completed_at       timestamptz not null,
  duration_ms        integer not null check (duration_ms >= 0),
  -- counts for list views without loading the whole report
  summary            jsonb not null,
  -- the full report exactly as the API produced it
  report             jsonb not null,
  created_at         timestamptz not null default now(),
  -- keep any single report bounded (~1 MB)
  constraint scans_report_size check (octet_length(report::text) <= 1048576)
);

create index if not exists scans_user_completed_idx on public.scans (user_id, completed_at desc);
create index if not exists scans_user_host_completed_idx on public.scans (user_id, hostname, completed_at desc);

-- ---------------------------------------------------------------------------
-- domains: domains a user has scanned or verified
-- ---------------------------------------------------------------------------
create table if not exists public.domains (
  user_id         uuid not null references auth.users (id) on delete cascade,
  domain          text not null check (char_length(domain) between 1 and 253),
  verified_at     timestamptz,
  last_scanned_at timestamptz,
  created_at      timestamptz not null default now(),
  primary key (user_id, domain)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.scans   enable row level security;
alter table public.domains enable row level security;

-- Start from zero, then grant only what the app needs.
revoke all on public.scans   from anon, authenticated;
revoke all on public.domains from anon, authenticated;
grant select, delete on public.scans   to authenticated;
grant select, delete on public.domains to authenticated;

drop policy if exists "Users read their own scans" on public.scans;
create policy "Users read their own scans"
  on public.scans for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own scans" on public.scans;
create policy "Users delete their own scans"
  on public.scans for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own domains" on public.domains;
create policy "Users read their own domains"
  on public.domains for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own domains" on public.domains;
create policy "Users delete their own domains"
  on public.domains for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No INSERT or UPDATE policies on purpose: only the API server writes.
