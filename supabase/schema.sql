-- Run this in Supabase SQL Editor before starting the application.
create extension if not exists pgcrypto;

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  tier_id text not null,
  tier_label text not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED')),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  created_at timestamptz not null default now(),
  captured_at timestamptz
);

create index if not exists donations_status_captured_at_idx
  on public.donations (status, captured_at desc);

alter table public.donations enable row level security;

-- No anon/authenticated policies are created. Browser requests cannot read or write
-- the ledger directly. Only server routes use the service-role key.
revoke all on table public.donations from anon, authenticated;
