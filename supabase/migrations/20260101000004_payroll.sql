-- =========================================================================
-- SIKon — Clean Baseline 4/5: Payroll
-- =========================================================================

create table public.weekly_payrolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  period_start date not null,
  period_end date not null,
  payment_date date not null,
  total_amount numeric not null default 0,
  sales_target_qty integer not null default 0,
  sales_below_target_scheme varchar not null default 'none',
  status varchar not null default 'draft',
  transaction_id uuid references public.transactions(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  constraint weekly_payrolls_status_check check (status in ('draft', 'paid')),
  constraint weekly_payrolls_sales_below_target_scheme_check check (sales_below_target_scheme in ('none', 'half')),
  constraint weekly_payrolls_sales_target_qty_check check (sales_target_qty >= 0),
  constraint weekly_payrolls_total_amount_check check (total_amount >= 0)
);
alter table public.weekly_payrolls enable row level security;
create policy "Manage own weekly payrolls" on public.weekly_payrolls
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_weekly_payrolls_user on public.weekly_payrolls(user_id);
create index idx_weekly_payrolls_period on public.weekly_payrolls(period_start, period_end);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  payroll_id uuid not null references public.weekly_payrolls(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  wage_type varchar not null,
  attendance_days integer not null default 0,
  daily_rate numeric not null default 0,
  base_amount numeric not null default 0,
  piecework_amount numeric not null default 0,
  sales_total_qty integer not null default 0,
  sales_potential_bonus numeric not null default 0,
  sales_bonus_percentage numeric not null default 100,
  sales_bonus_amount numeric not null default 0,
  allowances numeric not null default 0,
  deductions numeric not null default 0,
  take_home_pay numeric not null default 0,
  notes text,
  created_at timestamptz default now(),
  constraint payroll_items_wage_type_check check (wage_type in ('attendance', 'piecework', 'sales'))
);
alter table public.payroll_items enable row level security;
create policy "Manage own payroll items" on public.payroll_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_payroll_items_payroll on public.payroll_items(payroll_id);
create index idx_payroll_items_staff on public.payroll_items(staff_id);

create table public.piecework_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  staff_id uuid not null references public.staff(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  task_type varchar not null,
  qty integer not null,
  rate_per_unit numeric not null,
  total_wage numeric not null,
  notes text,
  status varchar not null default 'completed',
  completed_at timestamptz default now(),
  payroll_id uuid references public.weekly_payrolls(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz default now(),
  constraint piecework_tasks_task_type_check check (task_type in ('cutting', 'sewing', 'finishing', 'other')),
  constraint piecework_tasks_status_check check (status in ('pending', 'completed', 'paid')),
  constraint piecework_tasks_qty_check check (qty > 0),
  constraint piecework_tasks_rate_per_unit_check check (rate_per_unit >= 0),
  constraint piecework_tasks_total_wage_check check (total_wage >= 0)
);
alter table public.piecework_tasks enable row level security;
create policy "Manage own piecework tasks" on public.piecework_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_piecework_tasks_staff on public.piecework_tasks(staff_id);
create index idx_piecework_tasks_status on public.piecework_tasks(status);
create index idx_piecework_tasks_user on public.piecework_tasks(user_id);


-- =========================================================================
-- FUNCTIONS
-- =========================================================================

create function public.pay_weekly_payroll(p_payroll_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_payroll public.weekly_payrolls;
  v_cat_id uuid;
  v_trx_id uuid;
  v_item record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_payroll from public.weekly_payrolls where id = p_payroll_id and user_id = v_user_id;
  if v_payroll is null then raise exception 'Data payroll tidak ditemukan atau bukan milik Anda'; end if;
  if v_payroll.status = 'paid' then raise exception 'Payroll ini sudah dibayarkan sebelumnya'; end if;

  select id into v_cat_id from public.categories
  where user_id = v_user_id and name = 'Gaji Karyawan' and type = 'expense' limit 1;
  if v_cat_id is null then
    insert into public.categories (user_id, name, type) values (v_user_id, 'Gaji Karyawan', 'expense')
    returning id into v_cat_id;
  end if;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (
    v_user_id, v_cat_id,
    'Gaji Karyawan (' || to_char(v_payroll.period_start, 'DD/MM') || ' - ' || to_char(v_payroll.period_end, 'DD/MM/YYYY') || ')',
    v_payroll.total_amount, 'expense', v_payroll.payment_date,
    'Pembayaran payroll mingguan untuk karyawan (absensi, upah borongan, bonus sales)'
  )
  returning id into v_trx_id;

  for v_item in select staff_id from public.payroll_items where payroll_id = p_payroll_id and wage_type = 'piecework'
  loop
    update public.piecework_tasks
    set status = 'paid', payroll_id = p_payroll_id, paid_at = now()
    where user_id = v_user_id and staff_id = v_item.staff_id and status = 'completed';
  end loop;

  update public.weekly_payrolls set status = 'paid', transaction_id = v_trx_id where id = p_payroll_id;

  return jsonb_build_object('payroll_id', p_payroll_id, 'transaction_id', v_trx_id, 'status', 'paid');
end;
$$;

-- Cegah 2 periode payroll yang tumpang tindih untuk user yang sama.
create function public.check_payroll_period_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.weekly_payrolls
    where user_id = new.user_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and period_start <= new.period_end
      and period_end >= new.period_start
  ) then
    raise exception 'Periode % s/d % tumpang tindih dengan periode payroll yang sudah ada. Cek riwayat payroll Anda.',
      new.period_start, new.period_end;
  end if;
  return new;
end;
$$;

create trigger trg_check_payroll_period_overlap before insert or update of period_start, period_end on public.weekly_payrolls
  for each row execute function public.check_payroll_period_overlap();

revoke execute on function public.pay_weekly_payroll(uuid) from public, anon;
grant execute on function public.pay_weekly_payroll(uuid) to authenticated;

-- FIX dari baseline lama: function trigger ini sebelumnya masih punya EXECUTE
-- grant ke anon/public (kelewat saat dibuat, karena fungsi trigger seharusnya
-- cuma dipanggil internal oleh trigger, bukan langsung lewat RPC).
revoke execute on function public.check_payroll_period_overlap() from public, anon, authenticated;
