-- ASR Collection orders.
-- Items are immutable checkout snapshots; authoritative price/stock validation belongs in trusted database routines.

create table if not exists public.asr_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  shipping_address jsonb not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  order_status text not null default 'pending'
    check (order_status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'needs_review')),
  guest_token_hash text,
  idempotency_key text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_amount = subtotal + shipping_cost)
);

create index if not exists asr_orders_created_at_idx
  on public.asr_orders (created_at desc);

create index if not exists asr_orders_payment_status_idx
  on public.asr_orders (payment_status);

alter table public.asr_orders enable row level security;

comment on table public.asr_orders is
  'ASR Collection orders. Access is intended through trusted Edge Functions and controlled RPCs.';
