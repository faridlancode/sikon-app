-- ============================================================================
-- Smoke Test: po_monthly_report_phase4_smoke.sql
-- ============================================================================

do $$
declare
  v_test_user_id uuid := '91a4dd93-4cae-4a22-84d3-889d123aa5ac'::uuid;
  v_res jsonb;
  v_notes text;
  v_unlinked_mat numeric;
  v_crossing_batch_id uuid;
begin
  -- Set auth context
  perform set_config('request.jwt.claim.sub', v_test_user_id::text, true);

  -- 1. Test normal call get_po_monthly_report for 2026-10
  v_res := public.get_po_monthly_report(2026, 10);
  if v_res is null or not (v_res ? 'unlinked_material_purchases') then
    raise exception 'TEST FAILED: unlinked_material_purchases missing from JSON';
  end if;

  -- 2. Insert crossing PO batch to verify dynamic reconciliation notes
  insert into public.po_batches (
    user_id, code, name, start_date, end_date, period_year, period_month, status
  ) values (
    v_test_user_id, 'PO-CROSS-TEST', 'PO Lintas Buku Uji', '2026-10-25', '2026-11-05', 2026, 10, 'open'
  ) returning id into v_crossing_batch_id;

  v_res := public.get_po_monthly_report(2026, 10);
  v_notes := v_res->'reconciliation'->>'notes';

  if v_notes not like '%PO Lintas Buku Uji%' then
    raise exception 'TEST FAILED: dynamic reconciliation notes did not mention crossing PO: %', v_notes;
  end if;

  raise notice 'SUCCESS: dynamic reconciliation notes correctly identified crossing PO: %', v_notes;

  -- Cleanup test PO
  delete from public.po_batches where id = v_crossing_batch_id;

  raise notice 'ALL PHASE 4 SMOKE TESTS PASSED.';
end;
$$;
