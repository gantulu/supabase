-- ASR Collection product catalog.
-- Source file only: this SQL is not applied automatically.

create table if not exists public.asr_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asr_products_active_idx
  on public.asr_products (is_active);

create index if not exists asr_products_created_at_idx
  on public.asr_products (created_at desc);

alter table public.asr_products enable row level security;

comment on table public.asr_products is
  'ASR Collection product catalog. Add explicit least-privilege RLS policies before exposing client access.';
