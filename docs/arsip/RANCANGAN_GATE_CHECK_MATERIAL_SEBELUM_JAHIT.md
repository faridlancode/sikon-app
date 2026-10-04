# Desain Sistem: Gate Check Material Gudang sebelum Mulai Jahit

> **Status Dokumen:** Siap Diimplementasi (Approved Design)
> **Target Modul:** Worklog Jahit (`/worklog`), Gudang (`/warehouse`), RPC `start_sewing_assignment`, `start_all_sewing_assignments`
> **Sumber Daya:** `src/hooks/useSewingWorklog.ts`, `src/components/worklog/SewingQueueTab.tsx`, `supabase/migrations/20261003150001_gudang_dispatch_sewing_materials.sql`

---

## 1. Masalah: Celah Inkonsistensi yang Ada

### Skenario yang Bisa Terjadi Saat Ini

```
[Worklog] Penjahit klik "Mulai Jahit"
    → sewing_assignments.status = 'in_progress'
    → PADAHAL belum ada stock_movements yang sewing_assignment_id = assignment.id
    → Bahan belum keluar dari gudang!

[Gudang] Tab "Bahan Jahit" masih menampilkan assignment ini sebagai "belum diserahkan"
    → DATA TIDAK KONSISTEN
```

### Dampak Nyata di Lapangan

| Situasi | Dampak |
|---|---|
| Status `in_progress` tanpa material keluar | Stok gudang tidak berkurang padahal penjahit sedang mengerjakan |
| Status `done` + QC lolos tanpa material keluar | Laporan stok keluar tidak akurat — terlihat sisa stok lebih dari kenyataan |
| Payroll dihitung dari tugas `done` | Penjahit dibayar, tapi stok gudang tidak pernah dikurangi |
| Audit stok gudang | Trail `stock_movements` kosong padahal produksi sudah berjalan |

---

## 2. Pendekatan yang Dipilih: Kolom Gate + Supervisor Override

### Opsi yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Keputusan |
|---|---|---|---|
| **A. Hard Block di RPC** (error jika bahan belum dispatch) | Konsistensi absolut | Terlalu kaku — gudang berhalangan = penjahit tidak bisa mulai sama sekali | Terlalu rigid |
| **B. Kolom `material_dispatched_at` + Gate Check + Force Override** | Terstruktur, audit trail jelas, bisa Supervisor bypass darurat | Perlu kolom baru + patch RPC | **DIPILIH** |
| **C. Soft Warning di UI saja** | Paling fleksibel | Tidak ada perlindungan database, mudah dilangkahi | Tidak cukup |

### Keputusan Desain

- **TIDAK menambah status baru** (menjaga kompatibilitas kode yang sudah ada)
- Tambah kolom `material_dispatched_at` (`timestamptz`, nullable) di `sewing_assignments`
- Kolom ini **diset otomatis** oleh `dispatch_sewing_materials()` saat bahan berhasil diserahkan
- RPC `start_sewing_assignment` **memeriksa kolom ini** sebelum izinkan transisi ke `in_progress`
- Produk **tanpa BOM direct non-floor-stock**: gate check dilewati otomatis (tidak butuh dispatch)
- Supervisor bisa bypass dengan `p_force = true` + alasan wajib

---

## 3. Alur Status Setelah Perubahan

```
Distribusi Worklog
       |
       v
  [assigned]  <-- Penugasan dibuat
       |
       | Gudang: dispatch_sewing_materials()
       |   -> stock_movements dicatat
       |   -> material_dispatched_at = now()
       |
       v
  [in_progress]  <-- Penjahit mulai menjahit (bahan sudah ada)
       |
       | QC: record_qc_check()
       v
    [done]  <-- Selesai dijahit + QC

Shortcut (produk TANPA BOM direct / semua floor stock):
  assigned --> in_progress langsung (gate tidak aktif)

Override Supervisor (kondisi darurat):
  assigned --> in_progress (p_force=true + alasan wajib)
```

---

## 4. Desain Skema Database

```sql
-- =========================================================
-- Migration: Gate Check Material sebelum Mulai Jahit
-- =========================================================

-- 1. Tambah kolom material_dispatched_at pada sewing_assignments
alter table public.sewing_assignments
  add column if not exists material_dispatched_at timestamptz null;

comment on column public.sewing_assignments.material_dispatched_at is
  'Timestamp bahan Direct BOM diserahkan gudang ke penjahit. '
  'NULL = belum diserahkan. Diset otomatis oleh dispatch_sewing_materials(). '
  'Jika produk tidak punya BOM non-floor-stock, kolom ini diabaikan (gate tidak aktif).';

-- 2. Patch dispatch_sewing_materials() — set material_dispatched_at setelah berhasil dispatch
--    Tambahkan sebelum return di badan fungsi:
--
--    update public.sewing_assignments
--    set material_dispatched_at = now()
--    where id = p_sewing_assignment_id and user_id = v_user_id;

-- 3. Replace start_sewing_assignment() — dengan gate check + force override
create or replace function public.start_sewing_assignment(
  p_assignment_id uuid,
  p_force         boolean default false,
  p_force_reason  text    default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id        uuid := auth.uid();
  v_assignment     record;
  v_bom_count      int;
  v_needs_dispatch boolean;
  v_is_forced      boolean := false;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select sa.id, sa.status, sa.material_dispatched_at, oi.product_id
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where sa.id = p_assignment_id and sa.user_id = v_user_id;

  if not found then raise exception 'Penugasan jahit tidak ditemukan'; end if;
  if v_assignment.status <> 'assigned' then
    raise exception 'Penugasan tidak bisa dimulai — status saat ini: %', v_assignment.status;
  end if;

  -- Cek apakah produk punya BOM yang perlu diserahkan gudang (non-floor-stock)
  select count(*) into v_bom_count
  from public.product_materials pm
  join public.materials m on m.id = pm.material_id
  where pm.product_id = v_assignment.product_id
    and coalesce(m.is_floor_stock, false) = false;

  v_needs_dispatch := v_bom_count > 0;

  -- Gate check
  if v_needs_dispatch and v_assignment.material_dispatched_at is null then
    if not p_force then
      raise exception
        'Bahan belum diserahkan gudang. '
        'Serahkan bahan di menu Gudang → Bahan Jahit terlebih dahulu, '
        'atau minta Supervisor untuk memaksa mulai dengan alasan.';
    end if;

    -- Force mode: alasan wajib
    if p_force_reason is null or trim(p_force_reason) = '' then
      raise exception 'Alasan override wajib diisi saat memaksa mulai sebelum bahan diserahkan';
    end if;

    -- Override — catat alasan di notes
    update public.sewing_assignments
    set status = 'in_progress',
        notes  = coalesce(notes || ' | ', '') || '[PAKSA MULAI: ' || p_force_reason || ']'
    where id = p_assignment_id and user_id = v_user_id;

    v_is_forced := true;
  else
    -- Normal: bahan sudah diserahkan atau produk tidak butuh dispatch
    update public.sewing_assignments
    set status = 'in_progress'
    where id = p_assignment_id and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'success',         true,
    'assignment_id',   p_assignment_id,
    'forced_override', v_is_forced
  );
end;
$$;

revoke execute on function public.start_sewing_assignment(uuid, boolean, text) from public, anon;
grant  execute on function public.start_sewing_assignment(uuid, boolean, text) to authenticated;

-- 4. Replace start_all_sewing_assignments() — skip yang belum dispatch, return count
create or replace function public.start_all_sewing_assignments(
  p_staff_id uuid    default null,
  p_force    boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id   uuid := auth.uid();
  v_started   int  := 0;
  v_skipped   int  := 0;
  v_rec       record;
  v_bom_count int;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  for v_rec in
    select sa.id, sa.material_dispatched_at, oi.product_id
    from public.sewing_assignments sa
    join public.order_items oi on oi.id = sa.order_item_id
    where sa.user_id = v_user_id
      and sa.status  = 'assigned'
      and (p_staff_id is null or sa.staff_id = p_staff_id)
  loop
    select count(*) into v_bom_count
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_rec.product_id
      and coalesce(m.is_floor_stock, false) = false;

    -- Skip jika ada BOM direct, belum dispatch, dan bukan force mode
    if v_bom_count > 0 and v_rec.material_dispatched_at is null and not p_force then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.sewing_assignments
    set status = 'in_progress'
    where id = v_rec.id and user_id = v_user_id;

    v_started := v_started + 1;
  end loop;

  return jsonb_build_object(
    'success',     true,
    'started',     v_started,
    'skipped',     v_skipped,
    'skip_reason', case
      when v_skipped > 0 then 'Bahan belum diserahkan gudang untuk ' || v_skipped || ' penugasan'
      else null
    end
  );
end;
$$;

revoke execute on function public.start_all_sewing_assignments(uuid, boolean) from public, anon;
grant  execute on function public.start_all_sewing_assignments(uuid, boolean) to authenticated;
```

---

## 5. Update `dispatch_sewing_materials` (Patch)

Di dalam fungsi yang sudah ada, **tambahkan satu baris sebelum `return`**:

```sql
-- Di akhir badan dispatch_sewing_materials(), sebelum return:
update public.sewing_assignments
set material_dispatched_at = now()
where id = p_sewing_assignment_id
  and user_id = v_user_id;
```

Diimplementasikan sebagai **migration baru terpisah** agar tidak mengubah migration lama.

---

## 6. Update `types.ts`

```typescript
export interface SewingAssignment {
  // ... field yang sudah ada ...
  material_dispatched_at?: string | null;  // NEW
  notes?: string | null;                   // NEW (untuk log force override)
}
```

---

## 7. Update `useSewingWorklog.ts`

```typescript
// startAssignment — tambah parameter optional
const startAssignment = useCallback(async (
  assignmentId: string,
  force?: boolean,
  forceReason?: string
) => {
  const { data, error: rpcErr } = await supabase.rpc('start_sewing_assignment', {
    p_assignment_id: assignmentId,
    p_force: force ?? false,
    p_force_reason: forceReason ?? null,
  });
  if (rpcErr) throw new Error(rpcErr.message);
  await fetchAssignments();
  return data as { success: boolean; forced_override: boolean };
}, [fetchAssignments]);

// startAllAssignments — tambah parameter force
const startAllAssignments = useCallback(async (
  staffId?: string,
  force?: boolean
) => {
  const { data, error: rpcErr } = await supabase.rpc('start_all_sewing_assignments', {
    p_staff_id: staffId ?? null,
    p_force: force ?? false,
  });
  if (rpcErr) throw new Error(rpcErr.message);
  await fetchAssignments();
  return data as { success: boolean; started: number; skipped: number; skip_reason: string | null };
}, [fetchAssignments]);
```

---

## 8. Desain UI — `SewingQueueTab.tsx`

### 8.1 Badge Status Bahan pada Setiap Assignment Card

| Kondisi | Tampilan | Warna |
|---|---|---|
| Produk tanpa BOM direct | Tidak ditampilkan | — |
| `material_dispatched_at = null` + ada BOM | `⏳ Menunggu Bahan Gudang` | Amber |
| `material_dispatched_at IS NOT NULL` | `✓ Bahan Diterima • 03/10 09:15` | Emerald |
| Force override aktif (ada `[PAKSA MULAI:` di notes) | `⚠ Override Supervisor` | Rose |

### 8.2 Tombol "Mulai Jahit"

```
Kondisi: material_dispatched_at = null AND ada BOM
→ [Mulai Jahit ▶]  DISABLED
  tooltip: "Bahan belum diserahkan gudang. Selesaikan di Gudang → Bahan Jahit."

Kondisi: material_dispatched_at IS NOT NULL ATAU tidak ada BOM
→ [Mulai Jahit ▶]  ENABLED (normal)
```

### 8.3 Tombol "Paksa Mulai" (Supervisor Override)

```
Muncul jika: material_dispatched_at = null AND ada BOM
→ [⚠ Paksa Mulai]  (warna rose/amber, di samping tombol Mulai Jahit yang disabled)

Klik → Modal:
  ┌────────────────────────────────────────────┐
  │  ⚠ Override Supervisor                     │
  │  Penjahit akan mulai sebelum bahan         │
  │  diserahkan gudang. Alasan wajib diisi.    │
  │                                            │
  │  Alasan:  [________________________]  *    │
  │                                            │
  │  [Batal]        [Paksa Mulai]              │
  └────────────────────────────────────────────┘
```

### 8.4 "Mulai Semua" — Feedback Count Skip

```
Hasil: 3 dimulai, 2 dilewati

→ Toast/alert:
  "✓ 3 penugasan dimulai.
   ⏳ 2 penugasan dilewati — bahan belum diserahkan gudang.
   [Paksa Mulai Semua yang Dilewati?]"
```

---

## 9. Update `clear.sql`

Tambahkan `material_defect_returns` ke daftar truncate (tabel baru dari Modul 4):

```sql
-- Tambahkan di antara sewing_assignments dan qc_checks:
public.material_defect_returns,
```

---

## 10. Checklist Implementasi

### Database
- [ ] Migration baru: kolom `material_dispatched_at` + kolom `notes` di `sewing_assignments`
- [ ] Migration baru: patch `dispatch_sewing_materials` → set `material_dispatched_at`
- [ ] Migration baru: replace `start_sewing_assignment` dengan gate check + force override
- [ ] Migration baru: replace `start_all_sewing_assignments` dengan skip logic + return count

### Frontend
- [ ] `types.ts`: tambah `material_dispatched_at` dan `notes` ke `SewingAssignment`
- [ ] `useSewingWorklog.ts`: update `startAssignment(id, force?, reason?)` dan `startAllAssignments(staffId?, force?)`
- [ ] `SewingQueueTab.tsx`:
  - Badge `⏳ Menunggu Bahan Gudang` / `✓ Bahan Diterima`
  - Disable "Mulai Jahit" + tooltip jika bahan belum dispatch
  - Tombol "Paksa Mulai" + mini modal alasan (muncul hanya jika bahan belum dispatch)
  - Feedback count skip di "Mulai Semua"
- [ ] `useWarehouseDispatch.ts`: exclude assignment dengan `material_dispatched_at IS NOT NULL` dari `pendingAssignments`

### `clear.sql`
- [ ] Tambahkan `public.material_defect_returns` ke list TRUNCATE

---

## 11. Kasus Pengujian

| Skenario | Ekspektasi |
|---|---|
| Klik "Mulai Jahit" — bahan belum diserahkan, ada BOM | Error: "Bahan belum diserahkan gudang..." |
| Klik "Mulai Jahit" — bahan belum diserahkan, NO BOM | Sukses, langsung `in_progress` |
| Gudang serahkan bahan → klik "Mulai Jahit" | Sukses, `in_progress`, badge hijau muncul |
| Supervisor "Paksa Mulai" + isi alasan | Sukses, `in_progress`, alasan tercatat di `notes` |
| Supervisor "Paksa Mulai" tanpa isi alasan | Error: "Alasan override wajib diisi" |
| "Mulai Semua" — 3 sudah dispatch + 2 belum | 3 dimulai, 2 dilewati, info "2 penugasan dilewati" |
| Dispatch bahan → `material_dispatched_at` terisi | Assignment hilang dari tab "Bahan Jahit" gudang |
