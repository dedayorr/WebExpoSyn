-- WebExpoSyn: subscriptions (Paystack) and billing event log
--
-- Security model (same as scans):
--   * Only the API server writes, using the server-side secret key, after it
--     has verified a Paystack payment or a signed Paystack webhook.
--   * Signed-in users can READ their own subscription row and nothing else.
--     They can never insert or update it, so nobody can make themselves "pro".
--   * billing_events is server-only (no grants at all).
--
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to re-run.

create table if not exists public.subscriptions (
  user_id                    uuid primary key references auth.users (id) on delete cascade,
  plan                       text not null default 'free' check (plan in ('free', 'pro')),
  status                     text not null default 'inactive'
                               check (status in ('inactive', 'active', 'non_renewing', 'attention', 'cancelled')),
  paystack_customer_code     text,
  paystack_subscription_code text,
  paystack_email_token       text,
  current_period_end         timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx on public.subscriptions (paystack_customer_code);
create index if not exists subscriptions_subscription_idx on public.subscriptions (paystack_subscription_code);

-- Every Paystack webhook we accept, for idempotency (each event is applied once) and audit.
create table if not exists public.billing_events (
  id          text primary key,
  event       text not null,
  user_id     uuid references auth.users (id) on delete set null,
  payload     jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.subscriptions  enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.subscriptions  from anon, authenticated;
revoke all on public.billing_events from anon, authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists "Users read their own subscription" on public.subscriptions;
create policy "Users read their own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies and no billing_events grants on purpose:
-- only the API server changes billing data.
