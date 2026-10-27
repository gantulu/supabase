-- Trusted, transactional order creation and invoice persistence for Duitku POP.
-- Source only: review/test against the target schema before applying.
-- The RPCs must remain unavailable to anon/authenticated clients.

create or replace function public.asr_create_order_for_invoice(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_shipping_cost numeric,
  p_merchant_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_order public.asr_orders%rowtype;
  v_payment public.asr_payments%rowtype;
  v_input jsonb;
  v_product public.asr_products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_item_details jsonb := '[]'::jsonb;
  v_line_total numeric(12,2);
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 200 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if nullif(btrim(p_customer_name), '') is null or nullif(btrim(p_customer_email), '') is null
     or nullif(btrim(p_customer_phone), '') is null then
    raise exception 'customer_name_email_phone_required' using errcode = '22023';
  end if;
  if p_shipping_address is null or pg_catalog.jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'shipping_address_must_be_object' using errcode = '22023';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1 or pg_catalog.jsonb_array_length(p_items) > 50 then
    raise exception 'items_must_be_array_of_1_to_50' using errcode = '22023';
  end if;
  if p_shipping_cost is null or p_shipping_cost < 0 or p_shipping_cost <> pg_catalog.trunc(p_shipping_cost) then
    raise exception 'shipping_cost_must_be_nonnegative_integer_idr' using errcode = '22023';
  end if;
  if nullif(btrim(p_merchant_code), '') is null then
    raise exception 'merchant_code_required' using errcode = '22023';
  end if;

  -- Serialize retries using the same key to prevent duplicate stock reservation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  select o.* into v_order from public.asr_orders o where o.idempotency_key = p_idempotency_key;
  if found then
    select p.* into v_payment from public.asr_payments p where p.order_id = v_order.id for update;
    if not found then
      raise exception 'existing_order_has_no_payment_record' using errcode = 'P0001';
    end if;
    if v_payment.provider_merchant_code is distinct from p_merchant_code and v_payment.status <> 'paid' then
      update public.asr_payments set status = 'needs_review', updated_at = now() where id = v_payment.id;
      update public.asr_orders set payment_status = 'needs_review', updated_at = now() where id = v_order.id;
      v_payment.status := 'needs_review';
    end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', item->>'name', 'quantity', (item->>'quantity')::integer,
      'price', (item->>'line_total')::bigint
    ) order by ordinality), '[]'::jsonb)
    into v_item_details
    from pg_catalog.jsonb_array_elements(v_order.items) with ordinality as t(item, ordinality);
    if v_order.shipping_cost > 0 then
      v_item_details := v_item_details || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('name', 'Ongkos kirim', 'quantity', 1, 'price', v_order.shipping_cost::bigint)
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'order_id', v_order.id, 'order_number', v_order.order_number,
      'merchant_order_id', v_payment.merchant_order_id, 'payment_amount', v_payment.amount::bigint,
      'customer_name', v_order.customer_name, 'customer_email', v_order.customer_email,
      'customer_phone', v_order.customer_phone, 'product_details', 'Pembayaran pesanan ' || v_order.order_number,
      'item_details', v_item_details, 'payment_status', v_payment.status,
      'payment_url', v_payment.payment_url, 'provider_reference', v_payment.provider_reference
    );
  end if;

  v_order_id := gen_random_uuid();
  v_order_number := 'ASR-' || pg_catalog.replace(v_order_id::text, '-', '');
  insert into public.asr_orders (
    id, order_number, customer_name, customer_email, customer_phone, shipping_address,
    items, subtotal, shipping_cost, total_amount, order_status, payment_status, idempotency_key
  ) values (
    v_order_id, v_order_number, btrim(p_customer_name), btrim(p_customer_email), btrim(p_customer_phone),
    p_shipping_address, '[]'::jsonb, 0, p_shipping_cost, p_shipping_cost, 'pending', 'pending', p_idempotency_key
  );

  for v_input in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if nullif(v_input->>'product_id', '') is null or nullif(v_input->>'quantity', '') is null then
      raise exception 'each_item_requires_product_id_and_quantity' using errcode = '22023';
    end if;
    begin
      v_product_id := (v_input->>'product_id')::uuid;
      v_quantity := (v_input->>'quantity')::integer;
    exception when others then
      raise exception 'invalid_product_id_or_quantity' using errcode = '22023';
    end;
    if v_quantity < 1 or v_quantity > 100 then
      raise exception 'quantity_out_of_range' using errcode = '22023';
    end if;

    select p.* into v_product from public.asr_products p where p.id = v_product_id for update;
    if not found or not v_product.is_active then
      raise exception 'product_not_available' using errcode = 'P0001';
    end if;
    if v_product.stock < v_quantity then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
    if v_product.price <> pg_catalog.trunc(v_product.price) then
      raise exception 'product_price_must_be_integer_idr' using errcode = '22023';
    end if;

    v_line_total := v_product.price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    update public.asr_products set stock = stock - v_quantity, updated_at = now() where id = v_product.id;
    v_items_snapshot := v_items_snapshot || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.name, 'slug', v_product.slug,
      'quantity', v_quantity, 'unit_price', v_product.price::bigint, 'line_total', v_line_total::bigint
    ));
    -- Duitku's documented item total is the sum of each itemDetails.price; price is therefore the line total.
    v_item_details := v_item_details || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'name', pg_catalog.left(v_product.name, 50), 'quantity', v_quantity, 'price', v_line_total::bigint
    ));
  end loop;

  if p_shipping_cost > 0 then
    v_item_details := v_item_details || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('name', 'Ongkos kirim', 'quantity', 1, 'price', p_shipping_cost::bigint)
    );
  end if;
  if v_subtotal + p_shipping_cost <= 0 or v_subtotal + p_shipping_cost > 9999999999 then
    raise exception 'payment_amount_out_of_range' using errcode = '22023';
  end if;

  update public.asr_orders set items = v_items_snapshot, subtotal = v_subtotal,
    total_amount = v_subtotal + p_shipping_cost, updated_at = now() where id = v_order_id;
  insert into public.asr_payments (
    order_id, provider, merchant_order_id, provider_merchant_code, amount, status
  ) values (v_order_id, 'duitku', v_order_number, p_merchant_code, v_subtotal + p_shipping_cost, 'pending');

  return pg_catalog.jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'merchant_order_id', v_order_number,
    'payment_amount', (v_subtotal + p_shipping_cost)::bigint, 'customer_name', btrim(p_customer_name),
    'customer_email', btrim(p_customer_email), 'customer_phone', btrim(p_customer_phone),
    'product_details', 'Pembayaran pesanan ' || v_order_number, 'item_details', v_item_details,
    'payment_status', 'pending', 'payment_url', null, 'provider_reference', null
  );
end;
$$;

create or replace function public.asr_save_duitku_invoice(
  p_merchant_order_id text,
  p_provider_reference text,
  p_payment_url text,
  p_provider_result_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.asr_payments%rowtype;
begin
  if nullif(btrim(p_merchant_order_id), '') is null or nullif(btrim(p_provider_reference), '') is null
     or p_payment_url is null or p_payment_url not like 'https://%' or p_provider_result_code is distinct from '00' then
    raise exception 'invalid_provider_invoice_response' using errcode = '22023';
  end if;
  select p.* into v_payment from public.asr_payments p
    where p.merchant_order_id = p_merchant_order_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;

  if v_payment.provider_reference is not null then
    if v_payment.provider_reference <> p_provider_reference or v_payment.payment_url <> p_payment_url then
      update public.asr_payments set status = 'needs_review', updated_at = now() where id = v_payment.id;
      update public.asr_orders set payment_status = 'needs_review', updated_at = now() where id = v_payment.order_id;
      return pg_catalog.jsonb_build_object('status', 'needs_review');
    end if;
    return pg_catalog.jsonb_build_object('status', v_payment.status,
      'provider_reference', v_payment.provider_reference, 'payment_url', v_payment.payment_url);
  end if;

  if v_payment.status <> 'pending' then
    return pg_catalog.jsonb_build_object('status', v_payment.status);
  end if;
  update public.asr_payments set provider_reference = p_provider_reference,
    payment_url = p_payment_url, provider_result_code = p_provider_result_code, updated_at = now()
    where id = v_payment.id;
  return pg_catalog.jsonb_build_object('status', 'pending',
    'provider_reference', p_provider_reference, 'payment_url', p_payment_url);
end;
$$;

create or replace function public.asr_mark_payment_needs_review(
  p_merchant_order_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.asr_payments%rowtype;
begin
  select p.* into v_payment from public.asr_payments p
    where p.merchant_order_id = p_merchant_order_id for update;
  if not found then return pg_catalog.jsonb_build_object('status', 'not_found'); end if;
  if v_payment.status <> 'paid' then
    update public.asr_payments set status = 'needs_review',
      callback_payload = coalesce(callback_payload, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object('internal_review_reason', pg_catalog.left(coalesce(p_reason, 'provider_response_uncertain'), 200)),
      updated_at = now() where id = v_payment.id;
    update public.asr_orders set payment_status = 'needs_review', updated_at = now()
      where id = v_payment.order_id and payment_status <> 'paid';
  end if;
  return pg_catalog.jsonb_build_object('status', 'needs_review');
end;
$$;

revoke all on function public.asr_create_order_for_invoice(text, text, text, text, jsonb, jsonb, numeric, text) from public, anon, authenticated;
revoke all on function public.asr_save_duitku_invoice(text, text, text, text) from public, anon, authenticated;
revoke all on function public.asr_mark_payment_needs_review(text, text) from public, anon, authenticated;
grant execute on function public.asr_create_order_for_invoice(text, text, text, text, jsonb, jsonb, numeric, text) to service_role;
grant execute on function public.asr_save_duitku_invoice(text, text, text, text) to service_role;
grant execute on function public.asr_mark_payment_needs_review(text, text) to service_role;
