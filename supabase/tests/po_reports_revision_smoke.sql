-- Smoke test for migration 20261022090000_po_reports_matrix_and_progress.sql
do $$
declare
  v_test_user_id uuid;
  v_batch_id uuid;
  v_order_id uuid;
  v_cat_id uuid;
  v_sales_id uuid;
  v_res jsonb;
begin
  select id into v_test_user_id from auth.users limit 1;
  if v_test_user_id is null then
    raise notice 'No user found, skipping smoke test.';
    return;
  end if;

  -- Set auth.uid() context
  perform set_config('request.jwt.claim.sub', v_test_user_id::text, true);

  -- 1. Test get_po_daily_report
  v_res := public.get_po_daily_report('2026-10-21'::date);
  if v_res is null then
    raise exception 'TEST FAILED: get_po_daily_report returned null';
  end if;
  if not (v_res ? 'sales_category_matrix') then
    raise exception 'TEST FAILED: sales_category_matrix missing from get_po_daily_report';
  end if;
  if not (v_res ? 'past_unpaid_pos') then
    raise exception 'TEST FAILED: past_unpaid_pos missing from get_po_daily_report';
  end if;
  raise notice '[PASS] get_po_daily_report contains sales_category_matrix and past_unpaid_pos';

  -- 2. Test get_po_close_report
  select id into v_batch_id from public.po_batches where user_id = v_test_user_id limit 1;
  if v_batch_id is not null then
    v_res := public.get_po_close_report(v_batch_id);
    if v_res is null then
      raise exception 'TEST FAILED: get_po_close_report returned null';
    end if;
    if not (v_res ? 'sales_category_matrix') then
      raise exception 'TEST FAILED: sales_category_matrix missing from get_po_close_report';
    end if;
    if not (v_res ? 'production_progress_orders') then
      raise exception 'TEST FAILED: production_progress_orders missing from get_po_close_report';
    end if;
    raise notice '[PASS] get_po_close_report contains sales_category_matrix and production_progress_orders';
  end if;

  -- 3. Test get_po_monthly_report
  v_res := public.get_po_monthly_report(2026, 10);
  if v_res is null then
    raise exception 'TEST FAILED: get_po_monthly_report returned null';
  end if;
  if not (v_res ? 'sales_category_matrix') then
    raise exception 'TEST FAILED: sales_category_matrix missing from get_po_monthly_report';
  end if;
  raise notice '[PASS] get_po_monthly_report contains sales_category_matrix';

  raise notice 'ALL REPORTS REVISION SMOKE TESTS PASSED.';
end;
$$;
