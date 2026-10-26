-- Migration: 20261026231500_guard_sewing_qc_check_quantity.sql
-- Description: Validasi ketat kuota QC (lolos & reject) agar tidak melebihi sisa pengerjaan bundel jahit

create or replace function public.record_qc_check(
  p_assignment_id  uuid,
  p_passed_qty     numeric,
  p_rejected_qty   numeric,
  p_notes          text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_assignment   public.sewing_assignments%rowtype;
  v_order_item   record;
  v_rate         numeric;
  v_new_passed   numeric;
  v_new_rejected numeric;
  v_new_status   varchar;
  v_remaining    numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  if coalesce(p_passed_qty, 0) + coalesce(p_rejected_qty, 0) <= 0 then
    raise exception 'passed_qty + rejected_qty harus lebih dari 0';
  end if;

  if coalesce(p_passed_qty, 0) < 0 or coalesce(p_rejected_qty, 0) < 0 then
    raise exception 'Qty tidak boleh negatif';
  end if;

  select * into v_assignment
  from public.sewing_assignments
  where id = p_assignment_id and user_id = v_user_id;

  if not found then raise exception 'Bundel jahit tidak ditemukan'; end if;

  -- Hitung sisa yang belum diperiksa pada bundel ini
  v_remaining := v_assignment.assigned_qty - v_assignment.qc_passed_qty;

  if coalesce(p_passed_qty, 0) > v_remaining then
    raise exception 'Qty Lolos QC (% pcs) melebihi sisa bundel jahit (% pcs)',
      coalesce(p_passed_qty, 0),
      v_remaining;
  end if;

  if coalesce(p_rejected_qty, 0) > v_remaining then
    raise exception 'Qty Reject (% pcs) melebihi sisa bundel jahit (% pcs)',
      coalesce(p_rejected_qty, 0),
      v_remaining;
  end if;

  if (coalesce(p_passed_qty, 0) + coalesce(p_rejected_qty, 0)) > v_remaining then
    raise exception 'Total Qty lolos dan reject (% pcs) melebihi batas maksimal sisa jahit (% pcs)',
      (coalesce(p_passed_qty, 0) + coalesce(p_rejected_qty, 0)),
      v_remaining;
  end if;

  -- Ambil product_id & sewing_cost_per_pcs via order_item → product
  select oi.product_id, p.sewing_cost_per_pcs
  into v_order_item
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.id = v_assignment.order_item_id;

  -- Gunakan applied_sewing_rate dari sewing_assignments jika tersedia, fallback ke products.sewing_cost_per_pcs
  v_rate := coalesce(v_assignment.applied_sewing_rate, v_order_item.sewing_cost_per_pcs, 0);

  -- Hitung kumulatif baru
  v_new_passed   := v_assignment.qc_passed_qty + coalesce(p_passed_qty, 0);
  v_new_rejected := v_assignment.qc_rejected_qty + coalesce(p_rejected_qty, 0);

  if v_new_passed > v_assignment.assigned_qty then
    raise exception 'Akumulasi lolos QC (% pcs) melebihi target jahit (% pcs)',
      v_new_passed,
      v_assignment.assigned_qty;
  end if;

  -- Tentukan status baru
  if v_new_passed >= v_assignment.assigned_qty then
    v_new_status := 'completed';
  else
    v_new_status := 'in_progress';
  end if;

  -- Simpan QC check record
  insert into public.qc_checks
    (user_id, sewing_assignment_id, passed_qty, rejected_qty, notes)
  values
    (v_user_id, p_assignment_id, coalesce(p_passed_qty, 0), coalesce(p_rejected_qty, 0), p_notes);

  -- Update kumulatif di sewing_assignments
  update public.sewing_assignments
  set
    qc_passed_qty   = v_new_passed,
    qc_rejected_qty = v_new_rejected,
    status          = v_new_status
  where id = p_assignment_id;

  -- Kalau ada qty yang lolos QC, insert piecework_task baru dengan rate aktual
  if coalesce(p_passed_qty, 0) > 0 then
    insert into public.piecework_tasks
      (user_id, staff_id, order_id, product_id, task_type, qty, rate_per_unit, total_wage, status,
       sewing_assignment_id, notes)
    select
      v_user_id,
      v_assignment.staff_id,
      oi.order_id,
      oi.product_id,
      'sewing',
      p_passed_qty,
      v_rate,
      p_passed_qty * v_rate,
      'completed',
      p_assignment_id,
      coalesce(p_notes, 'Dari QC check')
    from public.order_items oi
    where oi.id = v_assignment.order_item_id;
  end if;
end;
$$;

revoke execute on function public.record_qc_check(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_qc_check(uuid, numeric, numeric, text) to authenticated;
