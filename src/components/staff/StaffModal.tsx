import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';
import type { Staff, SalesPerson } from '../../types';

interface StaffModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: Partial<Staff>) => Promise<void>;
  editingStaff: Staff | null;
  /** Daftar sales aktif untuk dipilih saat role='Sales' */
  salesList: SalesPerson[];
}

const ROLES = [
  { value: 'Purchasing', label: 'Purchasing (Belanja & Pengadaan)' },
  { value: 'Gudang', label: 'Staf Gudang (Inventory & Restock)' },
  { value: 'Penjahit', label: 'Penjahit (Upah Borongan)' },
  { value: 'Tukang Potong', label: 'Tukang Potong (Upah Borongan)' },
  { value: 'Sales', label: 'Sales / Pemasaran' },
  { value: 'Produksi', label: 'Staf Produksi / Lainnya' },
  { value: 'Driver', label: 'Driver / Logistik' },
  { value: 'Umum', label: 'Umum / Lainnya' },
];

const WAGE_TYPES = [
  { value: 'attendance', label: 'Gaji Harian (Berdasarkan Absensi)' },
  { value: 'piecework', label: 'Upah Borongan (Berdasarkan Pcs Selesai)' },
  { value: 'sales', label: 'Komisi / Bonus Target Sales' },
];

const EMPTY_FORM = {
  name: '',
  phone: '',
  role: 'Purchasing',
  wage_type: 'attendance' as 'attendance' | 'piecework' | 'sales',
  daily_rate: '',
  is_active: true,
  sales_id: '' as string | null,
};

export default function StaffModal({ open, onClose, onSubmit, editingStaff, salesList }: StaffModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(
      editingStaff
        ? {
            name: editingStaff.name,
            phone: editingStaff.phone || '',
            role: editingStaff.role || 'Purchasing',
            wage_type: editingStaff.wage_type || (
              editingStaff.role === 'Penjahit' || editingStaff.role === 'Tukang Potong'
                ? 'piecework'
                : editingStaff.role === 'Sales'
                ? 'sales'
                : 'attendance'
            ),
            daily_rate: editingStaff.daily_rate ? formatIDRInput(editingStaff.daily_rate) : '',
            is_active: editingStaff.is_active,
            sales_id: editingStaff.sales_id ?? null,
          }
        : EMPTY_FORM
    );
    setError('');
  }, [open, editingStaff]);

  if (!open) return null;

  const isSalesRole = form.role === 'Sales';

  // Data sales yang sedang dipilih (untuk tampilan read-only nama/HP)
  const selectedSales = salesList.find((s) => s.id === form.sales_id) ?? null;

  function handleRoleChange(newRole: string) {
    let autoWageType: 'attendance' | 'piecework' | 'sales' = 'attendance';
    if (newRole === 'Penjahit' || newRole === 'Tukang Potong') {
      autoWageType = 'piecework';
    } else if (newRole === 'Sales') {
      autoWageType = 'sales';
    }

    setForm((prev) => ({
      ...prev,
      role: newRole,
      wage_type: autoWageType,
      // Reset sales_id jika ganti dari Sales ke role lain
      sales_id: newRole === 'Sales' ? prev.sales_id : null,
    }));
  }

  function handleSalesIdChange(newSalesId: string) {
    const picked = salesList.find((s) => s.id === newSalesId) ?? null;
    setForm((prev) => ({
      ...prev,
      sales_id: newSalesId || null,
      // Nama & phone read-only saat role Sales — tidak perlu set di form,
      // akan diambil dari joined sales saat fetch.
      name: picked?.name ?? prev.name,
      phone: picked?.phone ?? prev.phone,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (isSalesRole) {
      if (!form.sales_id) return setError('Pilih nama sales dari daftar terlebih dahulu. Jika belum ada, tambahkan dulu di menu Pengguna & Sales.');
    } else {
      if (!form.name.trim()) return setError('Nama staf wajib diisi.');
    }

    setSubmitting(true);
    try {
      const payload: Partial<Staff> = {
        role: form.role,
        wage_type: form.wage_type,
        daily_rate: (form.wage_type === 'attendance' || form.wage_type === 'sales') ? parseIDRInput(form.daily_rate) : 0,
        is_active: form.is_active,
      };

      if (isSalesRole) {
        // Untuk role Sales: nama/HP/status diambil dari tabel sales (tidak disimpan salinan).
        // Hanya kirim sales_id — field lainnya diabaikan (DB ikut data dari join).
        payload.sales_id = form.sales_id;
        // Kirim name sementara untuk memenuhi not-null constraint jika ada;
        // nilai aslinya akan selalu di-override oleh join di useStaff.
        payload.name = selectedSales?.name ?? form.name;
        payload.phone = selectedSales?.phone ?? null;
        payload.is_active = selectedSales?.is_active ?? true;
      } else {
        payload.name = form.name.trim();
        payload.phone = form.phone.trim() || null;
        payload.sales_id = null;
      }

      await onSubmit(payload);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{editingStaff ? 'Edit Staf' : 'Tambah Staf'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {/* Peran / Divisi */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Peran / Divisi</span>
            <select
              value={form.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          {/* ───── ROLE SALES: pilih dari daftar sales existing ───── */}
          {isSalesRole ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Pilih dari Daftar Sales *
                </span>
                <select
                  value={form.sales_id ?? ''}
                  onChange={(e) => handleSalesIdChange(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">-- Pilih Sales --</option>
                  {salesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.phone ? ` (${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* Info read-only nama & HP dari sales terpilih */}
              {selectedSales && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-sm">
                  <p className="font-medium text-emerald-900">{selectedSales.name}</p>
                  {selectedSales.phone && (
                    <p className="text-xs text-emerald-700 mt-0.5">{selectedSales.phone}</p>
                  )}
                  <p className="mt-1 text-[11px] text-emerald-600">
                    Nama & nomor HP dikelola dari menu <strong>Pengguna & Sales</strong>.
                  </p>
                </div>
              )}

              {/* Petunjuk jika sales belum ada di daftar */}
              <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-800">
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Belum ada di daftar?{' '}
                  <strong>Tambahkan dulu di menu Pengguna &amp; Sales</strong>, lalu kembali ke sini.
                </span>
              </div>
            </div>
          ) : (
            /* ───── ROLE BUKAN SALES: form nama & HP manual ───── */
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Nama Lengkap *</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="mis. Budi Santoso"
                  className={inputClass}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">No. HP / WhatsApp (opsional)</span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="08xxxxxxxxxx"
                  className={inputClass}
                />
              </label>
            </>
          )}

          {/* Skema Penggajian */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Skema Penggajian</span>
            <select
              value={form.wage_type}
              onChange={(e) => setForm((f) => ({ ...f, wage_type: e.target.value as any }))}
              className={inputClass}
            >
              {WAGE_TYPES.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          {(form.wage_type === 'attendance' || form.wage_type === 'sales') && (
            <label className="block animate-in fade-in duration-150">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tarif Gaji Harian (Rp)</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.daily_rate}
                onChange={(e) => setForm((f) => ({ ...f, daily_rate: formatIDRInput(e.target.value) }))}
                placeholder="mis. 100.000"
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {form.wage_type === 'sales'
                  ? 'Dikalikan hari masuk kerja saat payroll (ditambah bonus penjualan).'
                  : 'Dikalikan jumlah hari masuk kerja saat payroll Sabtu.'}
              </p>
            </label>
          )}

          {form.wage_type === 'piecework' && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-900">
              💡 Upah dihitung otomatis per pcs dari pesanan/produk (tarif potong & jahit pada data produk).
            </div>
          )}

          {form.wage_type === 'sales' && !isSalesRole && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              💡 Bonus penjualan dihitung dari total pcs order yang dicapai vs target mingguan owner, ditambah gaji harian dari absensi.
            </div>
          )}

          {/* Status Aktif — hanya tampil kalau bukan role Sales (sales aktif/nonaktif dikelola dari halaman Sales) */}
          {!isSalesRole && (
            <label className="flex items-center gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600/30"
              />
              <span className="text-sm text-slate-700">Staf Aktif</span>
            </label>
          )}

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : editingStaff ? 'Simpan Perubahan' : 'Tambah Staf'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
