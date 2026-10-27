-- ASR Collection payment attempts.
-- Source file only: this SQL is not applied automatically.
-- Provider protocol uncertainty must be represented as needs_review, not guessed as a terminal failure.

create table if not exists public.asr_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.asr_orders(id) on delete restrict,
  provider text not null default 'duitku' check (provider = 'duitku'),
  merchant_order_id text not null unique,
  provider_merchant_code text,
  provider_reference text,
  payment_method text,
  payment_url text,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'needs_review')),
  provider_result_code text,
  callback_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asr_payments_order_id_unique unique (order_id)
);

create index if not exists asr_payments_status_idx
  on public.asr_payments (status);

alter table public.asr_payments
  add column if not exists provider_merchant_code text;

alter table public.asr_payments enable row level security;

comment on table public.asr_payments is
  'Duitku payment records. Store only validated callback data; do not store secrets or raw credentials.';
