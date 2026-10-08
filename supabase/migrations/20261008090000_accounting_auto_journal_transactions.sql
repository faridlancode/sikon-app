-- =========================================================================
-- Migration: Auto Journal dari Transactions + init_accounting (Fase A - Langkah 4)
-- =========================================================================
-- Menambahkan:
-- 1. Trigger trg_journal_from_transaction (after insert/update/delete on transactions)
-- 2. RPC init_accounting (seed COA, petakan kategori, aktifkan accounting_settings, backfill)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNGSI TRIGGER: journal_from_transaction
--    Dijalankan setelah insert/update/delete pada public.transactions.
--    No-op jika accounting belum enabled atau tanggal < books_start_date.
--    Aturan posting:
--      income + order_id + production_status != completed -> Dr Kas/Bank / Cr 2-1200 Uang Muka Pelanggan
--      income + order_id + production_status = completed  -> Dr Kas/Bank / Cr 1-1300 Piutang
--      income (counter_account_id set, e.g. Reversal Uang Muka) -> Dr Kas/Bank / Cr counter_account_id
--      expense (counter_account_id set, e.g. Uang Muka Purchasing kembali) -> Dr counter_account_id / Cr Kas/Bank
--      income lain -> Dr Kas/Bank / Cr category.account_id (atau 9-9999)
--      expense lain -> Dr category.account_id (atau 9-9999) / Cr Kas/Bank
-- ---------------------------------------------------------------------------
create or replace function public.journal_from_transaction()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_uid         uuid;
  v_settings    record;
  v_txn         record;  -- baris transaksi yang aktif (NEW atau OLD)
  v_entry_id    uuid;
  v_entry_no    varchar;
  v_cash_acct   uuid;
  v_counter_acct uuid;
  v_suspense_id  uuid;
  v_order_status text;
  v_acct_1300   uuid;
  v_acct_2200   uuid;
begin
  -- Gunakan NEW jika ada (insert/update), kalau delete pakai OLD
  v_txn := coalesce(new, old);
  v_uid := v_txn.user_id;

  -- Baca pengaturan akuntansi
  select * into v_settings from public.accounting_settings where user_id = v_uid;

  -- No-op jika akuntansi belum aktif
  if v_settings is null or not v_settings.enabled then
    return coalesce(new, old);
  end if;

  -- No-op jika transaksi sebelum books_start_date
  if v_settings.books_start_date is not null and v_txn.transaction_date < v_settings.books_start_date then
    return coalesce(new, old);
  end if;

  -- Cek periode terkunci (hanya untuk INSERT dan UPDATE baru)
  if tg_op in ('INSERT', 'UPDATE') then
    if v_settings.locked_through is not null and new.transaction_date <= v_settings.locked_through then
      raise exception
        'Periode akuntansi sampai % sudah ditutup.',
        v_settings.locked_through
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if v_settings.locked_through is not null and old.transaction_date <= v_settings.locked_through then
      raise exception
        'Periode akuntansi sampai % sudah ditutup. Transaksi lama tidak dapat diubah.',
        v_settings.locked_through
        using errcode = 'P0001';
    end if;
  end if;

  -- Cek kepemilikan akun jika diisi
  if tg_op in ('INSERT', 'UPDATE') then
    if new.cash_account_id is not null then
      if not exists (select 1 from public.accounts where id = new.cash_account_id and user_id = v_uid) then
        raise exception 'Akun kas/bank tidak ditemukan atau bukan milik Anda' using errcode = 'P0001';
      end if;
    end if;
    if new.counter_account_id is not null then
      if not exists (select 1 from public.accounts where id = new.counter_account_id and user_id = v_uid) then
        raise exception 'Akun lawan tidak ditemukan atau bukan milik Anda' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Hapus jurnal lama jika UPDATE atau DELETE
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.journal_entries
     where user_id = v_uid
       and source_type = 'transaction'
       and source_id = old.id;
  end if;

  -- Untuk DELETE, tidak perlu membuat jurnal baru
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- ---- Tentukan akun kas/bank ----
  -- Prioritas: new.cash_account_id -> default_cash_account_id -> akun 1-1200 (Bank)
  v_cash_acct := new.cash_account_id;
  if v_cash_acct is null then
    v_cash_acct := v_settings.default_cash_account_id;
  end if;
  if v_cash_acct is null then
    select id into v_cash_acct from public.accounts
     where user_id = v_uid and code = '1-1200' limit 1;
  end if;
  if v_cash_acct is null then
    -- Terakhir: ambil akun kas apapun
    select id into v_cash_acct from public.accounts
     where user_id = v_uid and is_cash = true limit 1;
  end if;
  if v_cash_acct is null then
    -- Tanpa akun kas, tidak bisa posting; jatuh ke 9-9999 tidak masuk akal untuk kas
    -- Cukup return tanpa posting (akuntansi belum lengkap)
    return new;
  end if;

  -- ---- Tentukan akun lawan ----
  v_counter_acct := new.counter_account_id;

  if v_counter_acct is null then
    -- Cek apakah ini transaksi pembayaran order
    if new.type = 'income' and new.order_id is not null then
      -- Cek status produksi order
      select production_status into v_order_status
        from public.orders where id = new.order_id;

      if v_order_status = 'completed' then
        -- Pelunasan setelah order dikirim: Cr Piutang Usaha (1-1300)
        select id into v_counter_acct from public.accounts
         where user_id = v_uid and code = '1-1300' limit 1;
      else
        -- DP / pelunasan sebelum dikirim: Cr Uang Muka Pelanggan (2-1200)
        select id into v_acct_2200 from public.accounts
         where user_id = v_uid and code = '2-1200' limit 1;
        v_counter_acct := v_acct_2200;
      end if;
    end if;
  end if;

  if v_counter_acct is null then
    -- Ambil dari kategori transaksi
    select tc.account_id into v_counter_acct
      from public.transaction_categories tc
     where tc.id = new.category_id
     limit 1;
  end if;

  -- Fallback ke akun 9-9999 Penampung
  if v_counter_acct is null then
    select id into v_suspense_id from public.accounts
     where user_id = v_uid and code = '9-9999' limit 1;
    v_counter_acct := v_suspense_id;
  end if;

  if v_counter_acct is null then
    -- Bahkan 9-9999 belum ada (init_accounting belum dijalankan?); skip posting
    return new;
  end if;

  -- ---- Generate entry_no ----
  v_entry_no := public.next_journal_entry_no(v_uid, new.transaction_date);

  -- ---- Insert journal_entry ----
  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type, source_id)
  values (v_uid, v_entry_no, new.transaction_date,
          coalesce(new.title, new.description, 'Transaksi otomatis'),
          'transaction', new.id)
  returning id into v_entry_id;

  -- ---- Insert 2 journal_lines ----
  if new.type = 'income' then
    -- Income: Dr Kas/Bank / Cr akun lawan
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values
      (v_entry_id, v_cash_acct,    new.amount, 0,           new.title, 1),
      (v_entry_id, v_counter_acct, 0,          new.amount,  new.title, 2);
  else
    -- Expense: Dr akun lawan / Cr Kas/Bank
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values
      (v_entry_id, v_counter_acct, new.amount, 0,           new.title, 1),
      (v_entry_id, v_cash_acct,    0,          new.amount,  new.title, 2);
  end if;

  return new;
end;
$$;

revoke execute on function public.journal_from_transaction() from public, anon, authenticated;

drop trigger if exists trg_journal_from_transaction on public.transactions;
create trigger trg_journal_from_transaction
  after insert or update of (amount, type, transaction_date, category_id, order_id, cash_account_id, counter_account_id) or delete
  on public.transactions
  for each row execute function public.journal_from_transaction();

-- ---------------------------------------------------------------------------
-- 2. RPC init_accounting
--    Idempotent: jalankan dua kali tidak menggandakan data.
--    (a) Seed 33 akun COA (is_system = true)
--    (b) Petakan kategori transaksi -> account_id berdasarkan nama
--    (c) Buat atau update accounting_settings (enabled = true)
--    (d) Backfill: posting jurnal untuk semua transactions >= books_start_date (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.init_accounting(p_books_start_date date)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_txn record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- books_start_date wajib tanggal 1
  if extract(day from p_books_start_date) <> 1 then
    raise exception 'books_start_date harus tanggal 1 (diterima: %)', p_books_start_date
      using errcode = 'P0001';
  end if;

  -- ---- (a) Seed COA (33 akun sistem) ----
  -- Format: (code, name, account_type, report_group, is_cash, cash_flow_activity)
  insert into public.accounts (user_id, code, name, account_type, report_group, is_cash, cash_flow_activity, is_system)
  select v_uid, c.code, c.name, c.account_type, c.report_group,
         coalesce(c.is_cash, false), coalesce(c.cash_flow_activity, 'operating'), true
  from (values
    ('1-1100', 'Kas',                               'asset',   'current_asset',  true,  'operating'),
    ('1-1200', 'Bank',                              'asset',   'current_asset',  true,  'operating'),
    ('1-1300', 'Piutang Usaha',                     'asset',   'current_asset',  false, 'operating'),
    ('1-1400', 'Uang Muka Karyawan (Purchasing)',   'asset',   'current_asset',  false, 'operating'),
    ('1-1500', 'Persediaan Bahan Baku',             'asset',   'current_asset',  false, 'operating'),
    ('1-2100', 'Mesin & Peralatan',                 'asset',   'fixed_asset',    false, 'investing'),
    ('1-2110', 'Akum. Penyusutan Mesin',            'asset',   'contra_asset',   false, 'investing'),
    ('1-2200', 'Kendaraan',                         'asset',   'fixed_asset',    false, 'investing'),
    ('1-2210', 'Akum. Penyusutan Kendaraan',        'asset',   'contra_asset',   false, 'investing'),
    ('1-2300', 'Inventaris & Perabot',              'asset',   'fixed_asset',    false, 'investing'),
    ('1-2310', 'Akum. Penyusutan Inventaris',       'asset',   'contra_asset',   false, 'investing'),
    ('1-2400', 'Bangunan',                          'asset',   'fixed_asset',    false, 'investing'),
    ('1-2410', 'Akum. Penyusutan Bangunan',         'asset',   'contra_asset',   false, 'investing'),
    ('2-1100', 'Hutang Usaha',                      'liability','current_liability',false,'operating'),
    ('2-1200', 'Uang Muka Pelanggan',               'liability','current_liability',false,'operating'),
    ('2-1300', 'Hutang Lain-lain',                  'liability','current_liability',false,'financing'),
    ('3-1000', 'Modal Disetor',                     'equity',  'equity',         false, 'financing'),
    ('3-2000', 'Laba Ditahan',                      'equity',  'equity',         false, 'financing'),
    ('3-3000', 'Prive',                             'equity',  'equity',         false, 'financing'),
    ('4-1000', 'Penjualan',                         'revenue', 'revenue',        false, 'operating'),
    ('4-1100', 'Pendapatan Ongkos Kirim',           'revenue', 'revenue',        false, 'operating'),
    ('4-2000', 'Pendapatan Jasa',                   'revenue', 'other',          false, 'operating'),
    ('4-9000', 'Pendapatan Lain-lain',              'revenue', 'other',          false, 'operating'),
    ('5-1000', 'HPP Bahan Baku',                    'expense', 'cogs',           false, 'operating'),
    ('5-1100', 'Upah Borongan Produksi',            'expense', 'cogs',           false, 'operating'),
    ('6-1000', 'Beban Gaji & Upah',                 'expense', 'opex',           false, 'operating'),
    ('6-2000', 'Beban Operasional',                 'expense', 'opex',           false, 'operating'),
    ('6-3000', 'Beban Sewa',                        'expense', 'opex',           false, 'operating'),
    ('6-4000', 'Beban Pemasaran',                   'expense', 'opex',           false, 'operating'),
    ('6-5000', 'Beban Utilitas',                    'expense', 'opex',           false, 'operating'),
    ('6-6000', 'Beban Penyusutan',                  'expense', 'opex',           false, 'operating'),
    ('6-9000', 'Beban Lain-lain',                   'expense', 'other',          false, 'operating'),
    ('9-9999', 'Penampung (Belum Diklasifikasi)',    'asset',   'suspense',       false, 'operating')
  ) as c(code, name, account_type, report_group, is_cash, cash_flow_activity)
  on conflict (user_id, code) do nothing;

  -- ---- (b) Petakan kategori transaksi -> account_id (idempotent: hanya yang masih null) ----
  -- Pemetaan nama kategori -> kode akun
  update public.transaction_categories tc
  set account_id = a.id
  from (values
    ('Penjualan',                'income',  '4-1000'),
    ('Jasa / Konsultasi',        'income',  '4-2000'),
    ('Pendapatan Lain',          'income',  '4-9000'),
    ('Investasi',                'income',  '3-1000'),
    ('Uang Muka Purchasing',     'expense', '1-1400'),
    ('Pembelian Kain',           'expense', '1-1500'),
    ('Pembelian Kancing',        'expense', '1-1500'),
    ('Pembelian Benang',         'expense', '1-1500'),
    ('Gaji Karyawan',            'expense', '6-1000'),
    ('Operasional',              'expense', '6-2000'),
    ('Jasa Purchasing',          'expense', '6-2000'),
    ('Lain-lain',                'expense', '6-9000'),
    ('Sewa Tempat',              'expense', '6-3000'),
    ('Marketing',                'expense', '6-4000'),
    ('Utilitas',                 'expense', '6-5000'),
    ('Pengembalian Uang Pelanggan','expense','2-1200')
  ) as m(cat_name, cat_type, acct_code)
  join public.accounts a
    on a.user_id = v_uid and a.code = m.acct_code
  where tc.user_id = v_uid
    and tc.name    = m.cat_name
    and tc.type    = m.cat_type
    and tc.account_id is null;

  -- ---- (c) Buat atau update accounting_settings ----
  insert into public.accounting_settings (user_id, enabled, books_start_date, default_cash_account_id)
  select v_uid, true, p_books_start_date,
         (select id from public.accounts where user_id = v_uid and code = '1-1200' limit 1)
  on conflict (user_id) do update
    set enabled            = true,
        books_start_date   = excluded.books_start_date,
        default_cash_account_id = coalesce(
          public.accounting_settings.default_cash_account_id,
          excluded.default_cash_account_id
        );

  -- ---- (d) Backfill: posting jurnal untuk transaksi >= books_start_date ----
  -- Trigger trg_journal_from_transaction akan membuat jurnal.
  -- UPDATE dengan set updated_at = updated_at memicu trigger AFTER UPDATE.
  -- Gunakan "touch" yang tidak mengubah data bisnis, hanya memicu trigger.
  -- Lewati transaksi yang sudah punya jurnal (partial unique index akan menolak duplikat).
  for v_txn in
    select t.id, t.user_id, t.transaction_date
      from public.transactions t
     where t.user_id = v_uid
       and t.transaction_date >= p_books_start_date
       and not exists (
         select 1 from public.journal_entries je
          where je.source_type = 'transaction' and je.source_id = t.id
       )
     order by t.transaction_date, t.created_at
  loop
    -- Touch: update description dengan nilai sama (trigger after update aktif)
    update public.transactions
    set description = description
    where id = v_txn.id;
  end loop;
end;
$$;

revoke execute on function public.init_accounting(date) from public, anon;
grant  execute on function public.init_accounting(date) to authenticated;
