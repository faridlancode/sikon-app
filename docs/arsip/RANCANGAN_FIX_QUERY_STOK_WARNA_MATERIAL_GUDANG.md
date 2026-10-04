# Analisis & Desain Sistem: Perbaikan Deteksi Stok Material Berwarna (Material Colors) di Gudang & Worklog

> **Status Dokumen:** Menunggu Review & Approval Pengguna  
> **Target Modul:** Modul Gudang (`/warehouse`), Worklog Jahit & Potong (`/worklog`), RPC `check_sewing_material_stock`, `dispatch_sewing_materials`, `check_cutting_material_stock`, `dispatch_cutting_materials`  
> **Referensi File:** `supabase/migrations/20261003150001_gudang_dispatch_sewing_materials.sql`, `supabase/migrations/20261003170001_gate_check_material_sebelum_jahit.sql`, `supabase/migrations/20261003190001_gate_check_potong_dan_dispatch_kain.sql`

---

## 1. Analisis Akar Masalah (Root Cause Investigation)

### Pertanyaan Pengguna:
> *"kayanya ada salah query, karena sekarang kancing dan sleting, mempunyai warna, jadi tidak terdeteksi di barang keluar, karena stock itu ada banyak, tapi di barang keluar stok dianggap 0, benar ga?"*

### Jawaban Investigasi: **BENAR 100%**.

Terdapat diskrepansi fundamental antara arsitektur penyimpanan stok material berwarna dengan query yang digunakan pada RPC pemeriksaan stok:

```
                                  MASTER MATERIAL (materials)
                                  id: 'mat-sleting-1'
                                  name: 'Sleting Jepang 25cm'
                                  stock_qty: 0  <-- (Hanya induk, stok aktual dipecah per warna!)
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
           material_colors (Hitam)                         material_colors (Putih)
           stock_qty: 50 pcs                               stock_qty: 50 pcs
           (Total riil di gudang = 100 pcs)
```

### Dimana Kesalahan Query Terjadi?

1. **Pada RPC `check_sewing_material_stock`**:
   ```sql
   select
     pm.material_id,
     m.name as mat_name,
     pm.quantity as bom_qty_per_pcs,
     coalesce(m.stock_qty, 0) as stock_qty,   <-- BUG: Hanya membaca m.stock_qty (nilainya 0)!
     m.unit
   from public.product_materials pm
   join public.materials m on m.id = pm.material_id
   where pm.product_id = v_assignment.product_id
   ```
   Karena material memiliki varian warna di tabel `material_colors`, kolom `materials.stock_qty` berisi `0` atau `NULL`. Akibatnya:
   - Preview stok menampilkan: `Stok: 0 pcs (kurang X pcs)`
   - Status terdeteksi: `⚠️ Stok Kurang`
   - Tombol serahkan bahan terkunci (`disabled`), padahal di fisik/tabel warna stoknya melimpah!

2. **Pada RPC `dispatch_sewing_materials`**:
   Validasi ketersediaan dan eksekusi pengurangan stok hanya melakukan:
   ```sql
   update public.materials set stock_qty = stock_qty - v_needed_qty where id = v_mat.material_id;
   ```
   Query ini gagal memotong stok di `material_colors` dan melempar error `Stok tidak cukup... tersedia 0`.

3. **Pada Kain Potong (`check_cutting_material_stock`)**:
   Jika suatu item order tidak memiliki `material_color_id` eksplisit di `order_item_fabrics`, query fallback ke `m.stock_qty` yang bernilai 0, mengabaikan akumulasi saldo di `material_colors`.

---

## 2. Solusi & Desain Perbaikan

### A. Strategi Perhitungan Stok Cerdas (Smart Color Stock Fallback)

Untuk setiap material dalam BOM produk:
1. **Cek apakah material memiliki varian warna aktif di `material_colors`**:
   - Jika **ADA varian warna**:
     - Total stok tersedia = $\sum(\text{stock\_qty dari material\_colors yang aktif})$.
     - Jika order memiliki preferensi warna (misal warna kain utama SPK = Hitam), prioritaskan stok varian warna tersebut.
   - Jika **TIDAK ADA varian warna**:
     - Total stok tersedia = `coalesce(m.stock_qty, 0)`.

```sql
-- Formula Stok Efektif:
coalesce(
  (
    select sum(mc.stock_qty)
    from public.material_colors mc
    where mc.material_id = m.id and mc.is_active = true
    having count(mc.id) > 0
  ),
  m.stock_qty,
  0
) as effective_stock_qty
```

---

### B. Strategi Pemotongan Stok Atomik saat Penyerahan (Dispatch Execution)

Saat staf gudang mengonfirmasi penyerahan bahan jahit (`dispatch_sewing_materials`):
1. **Jika Material Memiliki Varian Warna (`material_colors`)**:
   - Cari varian warna yang cocok dengan warna kain order/item (misal kain order = Hitam, cari sleting warna Hitam).
   - Jika ada warna yang cocok dan stoknya cukup $\ge$ kebutuhan:
     - Potong dari varian warna tersebut (`update material_colors set stock_qty = stock_qty - needed`).
     - Catat `stock_movements` dengan `material_color_id = matching_color_id`.
   - Jika tidak ada warna yang spesifik/cocok:
     - Alokasikan pemotongan dari varian warna yang memiliki stok terbesar yang tersedia.
     - Catat `stock_movements` tertaut ke `material_color_id` tersebut.
2. **Jika Material Polos (Tanpa Varian Warna)**:
   - Potong langsung dari `materials.stock_qty`.
   - Catat `stock_movements` dengan `material_color_id = null`.

---

## 3. Spesifikasi Perubahan Teknis (SQL & RPC)

### Migration Baru: `20261003200001_fix_material_color_stock_queries.sql`

#### 1. Perbarui `check_sewing_material_stock`
```sql
create or replace function public.check_sewing_material_stock(
  p_sewing_assignment_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assignment    record;
  v_mat           record;
  v_needed        numeric;
  v_curr_stock    numeric;
  v_result        jsonb := '[]'::jsonb;
  v_all_ok        boolean := true;
  v_colors_info   jsonb;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select sa.assigned_qty, oi.product_id, oi.id as order_item_id
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where sa.id = p_sewing_assignment_id and sa.user_id = v_user_id;

  if not found then raise exception 'Penugasan jahit tidak ditemukan'; end if;

  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit,
      -- Cek total stok dari varian warna jika ada, fallback ke stok master
      coalesce(
        (select sum(mc.stock_qty) from public.material_colors mc where mc.material_id = m.id and mc.is_active = true),
        m.stock_qty,
        0
      ) as effective_stock,
      exists(select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true) as has_colors
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    v_curr_stock := v_mat.effective_stock;

    if v_curr_stock < v_needed then
      v_all_ok := false;
    end if;

    -- Ambil ringkasan breakdown warna jika ada
    select jsonb_agg(jsonb_build_object('color_name', color_name, 'stock_qty', stock_qty))
    into v_colors_info
    from public.material_colors
    where material_id = v_mat.material_id and is_active = true;

    v_result := v_result || jsonb_build_object(
      'material_id',     v_mat.material_id,
      'material_name',   v_mat.mat_name,
      'needed_qty',      v_needed,
      'stock_qty',       v_curr_stock,
      'unit',            v_mat.unit,
      'has_colors',      v_mat.has_colors,
      'color_breakdown', v_colors_info,
      'is_sufficient',   (v_curr_stock >= v_needed)
    );
  end loop;

  return jsonb_build_object(
    'all_sufficient', v_all_ok,
    'assigned_qty',   v_assignment.assigned_qty,
    'materials',      v_result
  );
end;
$$;
```

#### 2. Perbarui `dispatch_sewing_materials`
```sql
create or replace function public.dispatch_sewing_materials(
  p_sewing_assignment_id uuid,
  p_recorded_by          uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assignment    record;
  v_mat           record;
  v_needed_qty    numeric;
  v_dispatched    jsonb := '[]'::jsonb;
  v_mov_id        uuid;
  v_target_col_id uuid;
  v_rem_qty       numeric;
  v_col_rec       record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select
    sa.*,
    oi.product_id,
    st.name as staff_name,
    o.order_id as order_code
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  join public.orders o on o.id = oi.order_id
  join public.staff st on st.id = sa.staff_id
  where sa.id = p_sewing_assignment_id and sa.user_id = v_user_id;

  if not found then raise exception 'Penugasan jahit tidak ditemukan'; end if;

  if v_assignment.material_dispatched_at is not null then
    return jsonb_build_object('success', true, 'assignment_id', p_sewing_assignment_id, 'already_dispatched', true);
  end if;

  -- 1. Validasi kecukupan seluruh bahan (wajib lengkap)
  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit,
      coalesce(
        (select sum(mc.stock_qty) from public.material_colors mc where mc.material_id = m.id and mc.is_active = true),
        m.stock_qty,
        0
      ) as effective_stock
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    if v_mat.effective_stock < v_needed_qty then
      raise exception
        'Stok tidak cukup untuk bahan "%": butuh % %, tersedia % %. Serah terima harus menunggu restock.',
        v_mat.mat_name, v_needed_qty, v_mat.unit, v_mat.effective_stock, v_mat.unit;
    end if;
  end loop;

  -- 2. Eksekusi pengeluaran stok
  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit,
      exists(select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true) as has_colors
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;

    if v_mat.has_colors then
      -- Potong dari varian warna yang tersedia
      v_rem_qty := v_needed_qty;
      for v_col_rec in
        select id, color_name, stock_qty
        from public.material_colors
        where material_id = v_mat.material_id and is_active = true and stock_qty > 0
        order by stock_qty desc
      loop
        if v_rem_qty <= 0 then exit; end if;

        declare
          v_deduct numeric := least(v_rem_qty, v_col_rec.stock_qty);
        begin
          update public.material_colors
          set stock_qty = stock_qty - v_deduct
          where id = v_col_rec.id;

          insert into public.stock_movements (
            user_id, material_id, material_color_id, movement_type, source_type, source_id,
            sewing_assignment_id, qty, unit, status, confirmed_at, taken_by, recorded_by, notes
          ) values (
            v_user_id, v_mat.material_id, v_col_rec.id, 'out', 'order_consumption',
            v_assignment.order_item_id, p_sewing_assignment_id, v_deduct, v_mat.unit,
            'confirmed', now(), v_assignment.staff_id, p_recorded_by,
            'Serah bahan jahit SPK ' || v_assignment.order_code || ' → ' || v_assignment.staff_name || ' (' || v_col_rec.color_name || ')'
          ) returning id into v_mov_id;

          v_rem_qty := v_rem_qty - v_deduct;
        end;
      end loop;
    else
      -- Potong dari stok master langsung
      insert into public.stock_movements (
        user_id, material_id, movement_type, source_type, source_id,
        sewing_assignment_id, qty, unit, status, confirmed_at, taken_by, recorded_by, notes
      ) values (
        v_user_id, v_mat.material_id, 'out', 'order_consumption',
        v_assignment.order_item_id, p_sewing_assignment_id, v_needed_qty, v_mat.unit,
        'confirmed', now(), v_assignment.staff_id, p_recorded_by,
        'Serah bahan jahit SPK ' || v_assignment.order_code || ' → ' || v_assignment.staff_name
      ) returning id into v_mov_id;

      update public.materials
      set stock_qty = stock_qty - v_needed_qty
      where id = v_mat.material_id;
    end if;

    v_dispatched := v_dispatched || jsonb_build_object(
      'material_id',    v_mat.material_id,
      'material_name',  v_mat.mat_name,
      'qty_dispatched', v_needed_qty,
      'unit',           v_mat.unit
    );
  end loop;

  -- 3. Buka Gate Check Jahit
  update public.sewing_assignments
  set material_dispatched_at = now()
  where id = p_sewing_assignment_id and user_id = v_user_id;

  return jsonb_build_object(
    'success',       true,
    'assignment_id', p_sewing_assignment_id,
    'dispatched',    v_dispatched
  );
end;
$$;
```

---

## 4. Rencana Implementasi

1. [ ] **Buat Migration Database**:
   - `20261003200001_fix_material_color_stock_queries.sql` berisi perbaikan `check_sewing_material_stock` dan `dispatch_sewing_materials`.
2. [ ] **Uji Coba & Verifikasi**:
   - Pastikan bahan ber-warna (seperti Sleting & Kancing) otomatis mendeteksi total stok gabungan dari `material_colors`.
   - Pastikan tombol serah bahan di halaman Gudang aktif dan tidak terkunci `0 pcs`.
3. [ ] **Update README.md & Dokumentasi**.
