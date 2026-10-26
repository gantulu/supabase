-- Transactional payment RPCs.
-- Review and test against the target schema before applying. Do not expose these routines to anon/authenticated roles.

create or replace function public.asr_get_order_status(
  p_order_id uuid
)
returns table (
  order_id uuid,
  order_number text,
  order_status text,
  payment_status text,
  total_amount numeric,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select o.id, o.order_number, o.order_status, o.payment_status, o.total_amount, o.paid_at
  from public.asr_orders as o
  where o.id = p_order_id;
$$;

revoke all on function public.asr_get_order_status(uuid) from public, anon, authenticated;
grant execute on function public.asr_get_order_status(uuid) to service_role;

-- Callback transition logic intentionally remains unimplemented until Duitku's result-code,
-- signature, amount-validation, and inquiry contracts are confirmed against official sources.
-- Keep unknown or conflicting callback outcomes in needs_review.
