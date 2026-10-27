-- Durable, idempotent callback processing for Duitku POP.
-- Source only: not applied automatically. Non-00 result codes remain needs_review until Duitku resolves the documented conflict.

create or replace function public.asr_process_duitku_callback(
  p_merchant_code text,
  p_amount text,
  p_merchant_order_id text,
  p_reference text,
  p_result_code text,
  p_callback_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.asr_payments%rowtype;
  v_amount numeric;
  v_review_reason text;
  v_next_status text;
begin
  select p.* into v_payment
  from public.asr_payments p
  where p.merchant_order_id = p_merchant_order_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;

  -- A duplicate or out-of-order callback must never downgrade a confirmed payment.
  if v_payment.status = 'paid' then
    return pg_catalog.jsonb_build_object('status', 'paid', 'duplicate', true);
  end if;

  if p_amount is null or length(p_amount) > 12 or p_amount !~ '^[0-9]+
    v_review_reason := 'invalid_amount_format';
  else
    v_amount := p_amount::numeric;
  end if;

  if v_review_reason is null and p_merchant_code is distinct from v_payment.provider_merchant_code then
    v_review_reason := 'merchant_code_mismatch';
  elsif v_review_reason is null and v_amount is distinct from v_payment.amount then
    v_review_reason := 'amount_mismatch';
  elsif v_review_reason is null and (
    nullif(p_reference, '') is null
    or v_payment.provider_reference is null
    or p_reference is distinct from v_payment.provider_reference
  ) then
    v_review_reason := 'reference_mismatch';
  end if;

  if v_review_reason is not null then
    update public.asr_payments
    set status = 'needs_review',
        provider_result_code = p_result_code,
        callback_payload = coalesce(p_callback_payload, '{}'::jsonb) ||
          pg_catalog.jsonb_build_object('review_reason', v_review_reason),
        updated_at = now()
    where id = v_payment.id;
    update public.asr_orders
    set payment_status = 'needs_review', updated_at = now()
    where id = v_payment.order_id and payment_status <> 'paid';
    return pg_catalog.jsonb_build_object('status', 'needs_review', 'reason', v_review_reason);
  end if;

  -- The official POP reference has conflicting descriptions of failure result codes (01 vs 02).
  -- Only 00 is consistently documented as success; never infer a terminal failure from other codes.
  if p_result_code = '00' then
    v_next_status := 'paid';
  else
    v_next_status := 'needs_review';
  end if;

  update public.asr_payments
  set status = v_next_status,
      provider_result_code = p_result_code,
      callback_payload = coalesce(p_callback_payload, '{}'::jsonb),
      paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      updated_at = now()
  where id = v_payment.id;

  update public.asr_orders
  set payment_status = v_next_status,
      order_status = case when v_next_status = 'paid' then 'confirmed' else order_status end,
      paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      updated_at = now()
  where id = v_payment.order_id and payment_status <> 'paid';

  return pg_catalog.jsonb_build_object('status', v_next_status, 'duplicate', false);
end;
$$;

revoke all on function public.asr_process_duitku_callback(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.asr_process_duitku_callback(text, text, text, text, text, jsonb) to service_role;
 then
    v_review_reason := 'invalid_amount_format';
  else
    v_amount := p_amount::numeric;
  end if;

  if v_review_reason is null and p_merchant_code is distinct from v_payment.provider_merchant_code then
    v_review_reason := 'merchant_code_mismatch';
  elsif v_review_reason is null and v_amount is distinct from v_payment.amount then
    v_review_reason := 'amount_mismatch';
  elsif v_review_reason is null and (
    nullif(p_reference, '') is null
    or v_payment.provider_reference is null
    or p_reference is distinct from v_payment.provider_reference
  ) then
    v_review_reason := 'reference_mismatch';
  end if;

  if v_review_reason is not null then
    update public.asr_payments
    set status = 'needs_review',
        provider_result_code = p_result_code,
        callback_payload = coalesce(p_callback_payload, '{}'::jsonb) ||
          pg_catalog.jsonb_build_object('review_reason', v_review_reason),
        updated_at = now()
    where id = v_payment.id;
    update public.asr_orders
    set payment_status = 'needs_review', updated_at = now()
    where id = v_payment.order_id and payment_status <> 'paid';
    return pg_catalog.jsonb_build_object('status', 'needs_review', 'reason', v_review_reason);
  end if;

  -- The official POP reference has conflicting descriptions of failure result codes (01 vs 02).
  -- Only 00 is consistently documented as success; never infer a terminal failure from other codes.
  if p_result_code = '00' then
    v_next_status := 'paid';
  else
    v_next_status := 'needs_review';
  end if;

  update public.asr_payments
  set status = v_next_status,
      provider_result_code = p_result_code,
      callback_payload = coalesce(p_callback_payload, '{}'::jsonb),
      paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      updated_at = now()
  where id = v_payment.id;

  update public.asr_orders
  set payment_status = v_next_status,
      order_status = case when v_next_status = 'paid' then 'confirmed' else order_status end,
      paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      updated_at = now()
  where id = v_payment.order_id and payment_status <> 'paid';

  return pg_catalog.jsonb_build_object('status', v_next_status, 'duplicate', false);
end;
$$;

revoke all on function public.asr_process_duitku_callback(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.asr_process_duitku_callback(text, text, text, text, text, jsonb) to service_role;
