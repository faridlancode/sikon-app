# Desain Sistem & Spesifikasi Implementasi: Pembagian Worklog Jahit (v2)

> **Status Dokumen:** Siap Diimplementasi (Approved Design)  
> **Target Modul:** Modul Worklog Jahit (`/worklog`), Database RPC `distribute_sewing_work_v2`, Manual Assignment Modal  
> **Sumber Daya:** `docs/DESAIN_WORKLOG_JAHIT.md`, `src/components/worklog/SewingQueueTab.tsx`, `src/hooks/useSewingWorklog.ts`

---

## 1. Latar Belakang & Aturan Bisnis yang Disetujui

1. **Masalah Pembagian v1**:
   Pada sistem v1, seluruh pool di-share rata ke seluruh penjahit. Untuk order partai besar (30 pcs) dengan 10 penjahit, masing-masing hanya dapat 3 pcs. Akibatnya penjahit terlalu sering berganti setelan mesin/benang dan produktivitas merosot.

2. **Skema Baru untuk Order PRIORITAS (Total Qty $\ge 6$ pcs)**:
   - Diproses **per-order secara utuh**.
   - Dibatasi **maksimal 3 orang penjahit per order**.
   - **Batas Bawah 5 Pcs/Orang**:
     $$\text{Target Penjahit} = \min\left(3, \max\left(1, \left\lfloor \frac{\text{Order Qty}}{5} \right\rfloor\right)\right)$$
     - Contoh 6–9 pcs: Dikerjakan **1 orang** (6–9 pcs).
     - Contoh 10–14 pcs: Dikerjakan **2 orang** (5–7 pcs/orang).
     - Contoh $\ge 15$ pcs: Dikerjakan **3 orang** (masing-masing $\ge 5$ pcs).
   - **Mekanisme Rotasi Adil (Fair Queue)**:
     Sistem memilih penjahit dengan prioritas:
     1. Paling lama belum menerima order prioritas (`last_priority_assigned_at ASC NULLS FIRST`).
     2. Jika seimbang, pilih penjahit dengan beban berjalan (sisa target belum QC) terendah.
   - Sisa penjahit yang belum kebagian otomatis berada di urutan terdepan saat order prioritas berikutnya masuk.
   - **Multi-Item Campuran**: Jika satu order memiliki beberapa item produk (misal kemeja & celana), kuota dibagi rata berurutan ke penjahit terpilih.

3. **Skema Baru untuk Order SATUAN (Total Qty $< 6$ pcs)**:
   - Dikumpulkan dalam pool satuan.
   - Dibagikan rata ke **seluruh penjahit aktif** agar semua penjahit kebagian minimal 1 pcs jika jumlah pool mencukupi.

4. **Dual Mode: Otomatis & Manual Override oleh Supervisor**:
   - **Mode Otomatis**: Sekali klik "Bagikan Otomatis", sistem memilihkan penjahit dan membagi pcs sesuai formula di atas.
   - **Mode Manual (Supervisor)**: Supervisor dapat membuka modal "Tugaskan Manual", mencentang penjahit pilihan sendiri (misal penjahit spesialis jaket), dan menentukan alokasi pcs per orang secara bebas.

---

## 2. Perubahan Skema Database

```sql
-- 1. Kolom pelacak rotasi giliran prioritas di tabel staff
alter table public.staff
  add column if not exists last_priority_assigned_at timestamptz null,
  add column if not exists priority_orders_count integer not null default 0;

comment on column public.staff.last_priority_assigned_at is 'Waktu terakhir staf ditugaskan pada order prioritas (untuk fair queue round-robin)';

-- 2. Tipe distribusi pada batch pembagian
alter table public.sewing_distribution_batches
  add column if not exists distribution_mode varchar not null default 'auto'
    check (distribution_mode in ('auto', 'manual')),
  add column if not exists target_order_type varchar not null default 'all'
    check (target_order_type in ('all', 'satuan', 'prioritas')),
  add column if not exists target_order_id uuid null references public.orders(id);
```

---

## 3. Database Functions & Algoritma RPC

### 3.1 RPC Pembagian Order Prioritas: `distribute_priority_sewing_order`
```sql
create or replace function public.distribute_priority_sewing_order(
  p_order_id uuid,
  p_manual_staff_ids uuid[] default null,     -- Jika null, sistem otomatis memilih fair queue
  p_manual_quotas numeric[] default null,      -- Jika null, sistem otomatis membagi rata
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_order         public.orders%rowtype;
  v_batch_id      uuid;
  v_total_qty     numeric := 0;
  v_num_tailors   integer;
  v_selected_ids  uuid[];
  v_quotas        numeric[];
  v_base_quota    numeric;
  v_remainder     numeric;
  v_item          record;
  v_item_remain   numeric;
  v_assign_qty    numeric;
  v_s             integer;
  v_staff_remain  numeric[];
  v_applied_rate  numeric;
  v_surcharge     numeric := 0;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  -- 1. Hitung total sisa item yang siap jahit di order ini
  select coalesce(sum(
    oi.qty - coalesce((
      select sum(sa.assigned_qty) from public.sewing_assignments sa
      where sa.order_item_id = oi.id and sa.user_id = v_user_id
    ), 0)
  ), 0)
  into v_total_qty
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.ready_for_sewing_at is not null;

  if v_total_qty <= 0 then
    raise exception 'Tidak ada item siap jahit yang tersisa pada order ini';
  end if;

  -- 2. Tentukan penjahit & kuota (Manual vs Otomatis)
  if p_manual_staff_ids is not null and array_length(p_manual_staff_ids, 1) > 0 then
    -- Jalur Manual Override Supervisor
    v_selected_ids := p_manual_staff_ids;
    v_quotas       := p_manual_quotas;
    v_num_tailors  := array_length(v_selected_ids, 1);
  else
    -- Jalur Otomatis: Batas minimal 5 pcs/orang, maks 3 penjahit
    v_num_tailors := least(3, greatest(1, floor(v_total_qty / 5)::integer));

    -- Ambil penjahit aktif dengan giliran prioritas paling lama & beban berjalan terendah
    select array_agg(s.id)
    into v_selected_ids
    from (
      select s.id
      from public.staff s
      left join (
        select sa.staff_id, sum(sa.assigned_qty - sa.qc_passed_qty) as current_load
        from public.sewing_assignments sa
        where sa.user_id = v_user_id and sa.status <> 'completed'
        group by sa.staff_id
      ) loads on loads.staff_id = s.id
      where s.user_id = v_user_id
        and s.wage_type = 'piecework'
        and s.is_active = true
        and (lower(s.role) like '%jahit%' or lower(s.role) like '%sewing%' or lower(s.role) like '%penjahit%')
      order by s.last_priority_assigned_at asc nulls first, coalesce(loads.current_load, 0) asc, s.name asc
      limit v_num_tailors
    ) s;

    if array_length(v_selected_ids, 1) is null then
      raise exception 'Tidak ada penjahit aktif yang tersedia';
    end if;

    v_num_tailors := array_length(v_selected_ids, 1);
    v_base_quota  := floor(v_total_qty / v_num_tailors);
    v_remainder   := v_total_qty - (v_base_quota * v_num_tailors);

    v_quotas := array_fill(v_base_quota, array[v_num_tailors]);
    for i in 1..v_remainder::integer loop
      v_quotas[i] := v_quotas[i] + 1;
    end loop;
  end if;

  v_staff_remain := v_quotas;

  -- 3. Buat Batch
  insert into public.sewing_distribution_batches
    (user_id, pool_qty_total, staff_count, notes, distribution_mode, target_order_type, target_order_id)
  values
    (v_user_id, v_total_qty, v_num_tailors, p_notes,
     case when p_manual_staff_ids is not null then 'manual' else 'auto' end,
     'prioritas', p_order_id)
  returning id into v_batch_id;

  -- 4. Distribusikan item campuran ke penjahit terpilih
  v_s := 1;
  for v_item in
    select oi.id, oi.product_id, (oi.qty - coalesce(sum(sa.assigned_qty), 0)) as remain_qty
    from public.order_items oi
    left join public.sewing_assignments sa on sa.order_item_id = oi.id and sa.user_id = v_user_id
    where oi.order_id = p_order_id and oi.ready_for_sewing_at is not null
    group by oi.id, oi.product_id, oi.qty
    having (oi.qty - coalesce(sum(sa.assigned_qty), 0)) > 0
    order by oi.created_at asc
  loop
    v_item_remain := v_item.remain_qty;

    -- Ambil tarif jahit produk
    select coalesce(p.sewing_cost_per_pcs, 0) into v_applied_rate
    from public.products p where p.id = v_item.product_id;

    while v_item_remain > 0 loop
      while v_s <= v_num_tailors and v_staff_remain[v_s] <= 0 loop
        v_s := v_s + 1;
      end loop;

      if v_s > v_num_tailors then exit; end if;

      v_assign_qty := least(v_item_remain, v_staff_remain[v_s]);

      insert into public.sewing_assignments (
        user_id, order_item_id, staff_id, batch_id, assigned_qty, applied_sewing_rate, status
      ) values (
        v_user_id, v_item.id, v_selected_ids[v_s], v_batch_id, v_assign_qty, v_applied_rate, 'assigned'
      );

      v_item_remain       := v_item_remain - v_assign_qty;
      v_staff_remain[v_s] := v_staff_remain[v_s] - v_assign_qty;
    end loop;
  end loop;

  -- 5. Update tracking rotasi prioritas pada penjahit yang terpilih
  update public.staff
  set last_priority_assigned_at = now(),
      priority_orders_count     = priority_orders_count + 1
  where id = any(v_selected_ids);

  return v_batch_id;
end;
$$;
```

---

## 4. Perubahan UI pada Halaman Worklog (`/worklog`)

### 4.1 Tab "Antrian Jahit" — Pemisahan Section Prioritas vs Satuan
1. **Bagian Atas: Order Prioritas (Tiap Card = 1 Order)**
   - Header Card: `[PRIORITAS] ORD-101 — PT Adhi Karya (Total 30 pcs)`.
   - Ringkasan item: Kemeja Drill 20 pcs, Celana Chino 10 pcs.
   - Status antrian penjahit rekomendasi:
     - 💡 *Saran Sistem (3 Penjahit): Agus (10 pcs), Budi (10 pcs), Dedi (10 pcs) — Berdasarkan giliran prioritas.*
   - Aksi:
     - Tombol **"⚡ Bagikan Otomatis (3 Orang)"** $\to$ langsung memanggil RPC di atas.
     - Tombol **"✏️ Sesuaikan / Manual SPV"** $\to$ membuka modal supervisor untuk memilih penjahit dan mengubah alokasi pcs per orang secara custom.

2. **Bagian Bawah: Antrian Order Satuan (< 6 pcs)**
   - Berisi daftar item-item satuan yang digabung dalam satu tabel ringkas.
   - Header Section: `Total 18 pcs pakaian satuan dari 7 order berbeda`.
   - Tombol **"Bagikan Rata Semua Satuan"**: Membagikan 18 pcs ini secara rata ke seluruh penjahit aktif, sehingga semua staf mendapat minimal 1–2 pcs dengan surcharge $+Rp 10.000$ per pcs.

---

## 5. Checklist Implementasi & Pengujian

- [ ] Jalankan migrasi kolom `last_priority_assigned_at` & `priority_orders_count` pada `staff`.
- [ ] Buat RPC `distribute_priority_sewing_order` dan modifikasi RPC `distribute_sewing_work` untuk order satuan.
- [ ] Buat komponen `ManualSewingAssignModal.tsx` untuk supervisor yang ingin memilih penjahit manual.
- [ ] Update `SewingQueueTab.tsx` agar memisahkan visual card Order Prioritas dengan Order Satuan.
- [ ] Verifikasi kasus:
  - Order 7 pcs $\implies$ target 1 penjahit (karena $< 10$).
  - Order 12 pcs $\implies$ target 2 penjahit (6 pcs masing-masing).
  - Order 30 pcs $\implies$ target 3 penjahit (10 pcs masing-masing).
  - Verifikasi bahwa order prioritas berikutnya memilih penjahit yang berbeda (rotasi adil).
