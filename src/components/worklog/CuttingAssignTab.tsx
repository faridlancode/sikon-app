import React, { useState, useMemo } from 'react';
import {
  Scissors,
  AlertCircle,
  CheckCircle2,
  Check,
  Clock,
  User,
  UserPlus,
  Layers,
  Sparkles,
  Calendar,
} from 'lucide-react';
import type { CuttingAssignment } from '../../types';

interface CuttingAssignTabProps {
  cuttingAssignments: CuttingAssignment[];
  unassignedItems: any[];
  staffList: { id: string; name: string; role?: string | null }[];
  loading: boolean;
  onAssign: (orderItemId: string, staffId: string, notes: string | null) => Promise<void>;
  onMarkDone: (orderItemId: string, cuttingQty: number | null, notes: string | null) => Promise<void>;
}

type CuttingView = 'queue' | 'active';

export default function CuttingAssignTab({
  cuttingAssignments,
  unassignedItems,
  staffList,
  loading,
  onAssign,
  onMarkDone,
}: CuttingAssignTabProps) {
  const [currentView, setCurrentView] = useState<CuttingView>('queue');
  const [assignModalItem, setAssignModalItem] = useState<any | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal / prompt tandai selesai
  const [doneModalItem, setDoneModalItem] = useState<{
    id: string;
    name_item: string;
    qty: number;
    order_id?: string;
  } | null>(null);
  const [doneQty, setDoneQty] = useState<number>(0);
  const [doneNotes, setDoneNotes] = useState<string>('');
  const [doneSubmitting, setDoneSubmitting] = useState(false);

  // Filter staff potong
  const cuttingStaff = staffList.filter(
    (s) =>
      !s.role ||
      s.role.toLowerCase().includes('potong') ||
      s.role.toLowerCase().includes('cutting') ||
      s.role.toLowerCase().includes('produksi')
  );
  const displayStaff = cuttingStaff.length > 0 ? cuttingStaff : staffList;

  // Active assignments
  const activeAssignments = useMemo(
    () => cuttingAssignments.filter((a) => a.status === 'assigned'),
    [cuttingAssignments]
  );

  const totalUnassignedQty = useMemo(
    () => unassignedItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
    [unassignedItems]
  );

  const totalActiveQty = useMemo(
    () =>
      activeAssignments.reduce(
        (sum, a) => sum + (Number(a.order_items?.qty) || 0),
        0
      ),
    [activeAssignments]
  );

  function openAssignModal(item: any) {
    setAssignModalItem(item);
    setSelectedStaffId(displayStaff[0]?.id || '');
    setNotes('');
    setError(null);
  }

  async function handleConfirmAssign() {
    if (!assignModalItem || !selectedStaffId) {
      setError('Pilih tukang potong terlebih dahulu');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onAssign(assignModalItem.id, selectedStaffId, notes || null);
      const chosenStaff = displayStaff.find((s) => s.id === selectedStaffId);
      setSuccess(
        `Item "${assignModalItem.name_item}" berhasil ditugaskan ke ${chosenStaff?.name || 'tukang potong'}.`
      );
      setAssignModalItem(null);
      setSelectedStaffId('');
      setNotes('');
      // Switch view ke tugas aktif agar pengguna langsung melihat hasilnya
      setCurrentView('active');
    } catch (e: any) {
      setError(e.message ?? 'Gagal menugaskan item potong');
    } finally {
      setSubmitting(false);
    }
  }

  function openDoneModal(assignment: CuttingAssignment) {
    const item = assignment.order_items;
    if (!item) return;
    setDoneModalItem({
      id: item.id,
      name_item: item.name_item,
      qty: Number(item.qty) || 0,
      order_id: item.orders?.order_id,
    });
    setDoneQty(Number(item.qty) || 0);
    setDoneNotes('');
  }

  async function handleConfirmDone() {
    if (!doneModalItem) return;
    if (doneQty <= 0) {
      setError('Qty potong harus lebih dari 0');
      return;
    }
    setDoneSubmitting(true);
    try {
      await onMarkDone(doneModalItem.id, doneQty, doneNotes || null);
      setSuccess(
        `Item "${doneModalItem.name_item}" ditandai selesai dipotong. Upah borongan otomatis dicatat.`
      );
      setDoneModalItem(null);
    } catch (e: any) {
      setError(e.message ?? 'Gagal menandai item selesai');
    } finally {
      setDoneSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setCurrentView('queue')}
          className={`cursor-pointer rounded-xl border p-4 transition-all shadow-sm ${
            currentView === 'queue'
              ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
              : 'border-border bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Antrian Siap Potong
            </span>
            <span className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <Scissors className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {unassignedItems.length}{' '}
            <span className="text-sm font-normal text-muted-foreground">item</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Total {totalUnassignedQty} pcs siap dipotong (Rekap selesai)
          </p>
        </div>

        <div
          onClick={() => setCurrentView('active')}
          className={`cursor-pointer rounded-xl border p-4 transition-all shadow-sm ${
            currentView === 'active'
              ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
              : 'border-border bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sedang Dikerjakan
            </span>
            <span className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {activeAssignments.length}{' '}
            <span className="text-sm font-normal text-muted-foreground">tugas</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Total {totalActiveQty} pcs dalam proses pemotongan
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tukang Potong Aktif
            </span>
            <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <User className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {displayStaff.length}{' '}
            <span className="text-sm font-normal text-muted-foreground">orang</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {displayStaff.map((s) => s.name).slice(0, 3).join(', ')}
            {displayStaff.length > 3 ? '...' : ''}
          </p>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setCurrentView('queue')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 transition ${
              currentView === 'queue'
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4 text-blue-600" />
            Antrian Siap Potong
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                currentView === 'queue'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {unassignedItems.length}
            </span>
          </button>

          <button
            onClick={() => setCurrentView('active')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 transition ${
              currentView === 'active'
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'hover:text-slate-900'
            }`}
          >
            <Clock className="h-4 w-4 text-amber-600" />
            Sedang Dikerjakan
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                currentView === 'active'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {activeAssignments.length}
            </span>
          </button>
        </div>

        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}
      </div>

      {/* VIEW 1: Antrian Siap Potong */}
      {currentView === 'queue' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Scissors className="h-4 w-4 text-primary" />
                Daftar Item Antri Potong ({unassignedItems.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Item pesanan yang telah menyelesaikan tahap "Rekap Order" dan siap ditugaskan ke tukang potong.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Memuat antrian potong...
              </div>
            ) : unassignedItems.length === 0 ? (
              <div className="p-12 text-center">
                <Scissors className="mx-auto h-12 w-12 text-slate-200" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Antrian potong sedang kosong
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                  Item pesanan baru akan otomatis masuk ke antrian potong ini setelah tahap{' '}
                  <span className="font-semibold text-slate-800">"Rekap Order"</span> ditandai selesai
                  pada halaman Detail Order / Timeline Pesanan.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Order & Pelanggan</th>
                      <th className="px-4 py-3">Item Pesanan</th>
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3 text-right">Target Potong</th>
                      <th className="px-4 py-3 text-right">Tarif Potong</th>
                      <th className="px-4 py-3 text-right">Estimasi Borongan</th>
                      <th className="px-4 py-3">Status Tahap</th>
                      <th className="px-4 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unassignedItems.map((item, idx) => {
                      const order = item.orders;
                      const product = item.products;
                      const rate = Number(product?.cutting_cost_per_pcs) || 0;
                      const qty = Number(item.qty) || 0;
                      const estWage = qty * rate;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-primary/5 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            <div>
                              <span className="font-mono text-xs font-semibold text-primary">
                                {order?.order_id || 'PO-NEW'}
                              </span>
                              <p className="text-xs text-slate-600 font-medium">
                                {order?.customer_name || 'Pelanggan'}
                              </p>
                              {order?.order_date && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(order.order_date).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                  })}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold text-slate-900 block">
                              {item.name_item || 'Item'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-700">
                            {product?.name || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                            {qty}{' '}
                            <span className="text-xs font-normal text-muted-foreground">pcs</span>
                          </td>
                          <td className="px-4 py-3.5 text-right text-xs text-slate-600">
                            {rate > 0 ? `Rp ${rate.toLocaleString('id-ID')}` : '-'}
                          </td>
                          <td className="px-4 py-3.5 text-right text-xs font-semibold text-emerald-700">
                            {estWage > 0 ? `Rp ${estWage.toLocaleString('id-ID')}` : '-'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              Siap Potong
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => openAssignModal(item)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition cursor-pointer"
                              title="Tugaskan item ini ke tukang potong"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Tugaskan
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: Tugas Potong Sedang Berjalan */}
      {currentView === 'active' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Scissors className="h-4 w-4 text-primary" />
                Tugas Potong Sedang Berjalan ({activeAssignments.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Penugasan potong aktif. Klik "Tandai Selesai" saat proses potong selesai untuk otomatis mencatat upah borongan.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Memuat daftar tugas potong...
              </div>
            ) : activeAssignments.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="mx-auto h-12 w-12 text-slate-200" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Tidak ada tugas potong yang sedang aktif
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Gunakan tab "Antrian Siap Potong" di atas untuk menugaskan item ke tukang potong.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Order & Pelanggan</th>
                      <th className="px-4 py-3">Item Pesanan</th>
                      <th className="px-4 py-3">Tukang Potong</th>
                      <th className="px-4 py-3 text-right">Target Qty</th>
                      <th className="px-4 py-3">Tgl Ditugaskan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeAssignments.map((a, idx) => {
                      const item = a.order_items;
                      const orderData = item?.orders;
                      const assignedAt = new Date(a.assigned_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      });

                      return (
                        <tr
                          key={a.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-xs font-semibold text-primary">
                              {orderData?.order_id ?? '-'}
                            </span>
                            <span className="text-xs text-slate-600 block font-medium">
                              {orderData?.customer_name || 'Pelanggan'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold text-slate-900 block">
                              {item?.name_item || 'Item'}
                            </span>
                            {a.notes && (
                              <p className="text-[11px] text-slate-400 italic mt-0.5">
                                Catatan: {a.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-800">
                                {a.staff?.name ?? '-'}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground block">
                              {a.staff?.role || 'Tukang Potong'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                            {item?.qty ?? 0}{' '}
                            <span className="text-xs font-normal text-muted-foreground">pcs</span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500">{assignedAt}</td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                              <Clock className="h-3 w-3" />
                              Sedang Dikerjakan
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => openDoneModal(a)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Tandai Selesai
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Penugasan Potong */}
      {assignModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Scissors className="h-5 w-5 text-primary" />
                Tugaskan Item ke Tukang Potong
              </h4>
              <button
                onClick={() => setAssignModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-border bg-slate-50 p-3.5 space-y-1.5 text-xs text-slate-600">
              <p>
                <strong className="text-slate-900">No. Order:</strong>{' '}
                <span className="font-mono font-semibold text-primary">
                  {assignModalItem.orders?.order_id || '-'}
                </span>{' '}
                ({assignModalItem.orders?.customer_name || 'Pelanggan'})
              </p>
              <p>
                <strong className="text-slate-900">Item Pesanan:</strong> {assignModalItem.name_item}
              </p>
              <p>
                <strong className="text-slate-900">Target Potong:</strong>{' '}
                <span className="font-bold text-slate-900">{assignModalItem.qty} pcs</span>
              </p>
              {assignModalItem.products?.cutting_cost_per_pcs != null && (
                <p>
                  <strong className="text-slate-900">Tarif Upah Borongan:</strong> Rp{' '}
                  {Number(assignModalItem.products.cutting_cost_per_pcs).toLocaleString('id-ID')} /
                  pcs
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Pilih Tukang Potong <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Pilih staf tukang potong --</option>
                {displayStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.role ? `(${s.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Catatan Pemotongan (opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Instruksi pola kain, susut kain, dsb"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setAssignModalItem(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                disabled={submitting || !selectedStaffId}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Tugaskan Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Tandai Selesai */}
      {doneModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-600" />
                Konfirmasi Selesai Potong
              </h4>
              <button
                onClick={() => setDoneModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl text-xs text-slate-600">
              <p>
                <strong className="text-slate-900">Order:</strong> {doneModalItem.order_id || '-'}
              </p>
              <p>
                <strong className="text-slate-900">Item:</strong> {doneModalItem.name_item}
              </p>
              <p>
                <strong className="text-slate-900">Target Order Qty:</strong>{' '}
                <span className="font-bold text-slate-900">{doneModalItem.qty} pcs</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qty Aktual Terpotong (pcs) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={doneQty}
                onChange={(e) => setDoneQty(Number(e.target.value))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-bold text-slate-800"
              />
              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                Sesuaikan jika ada selisih karena kain rusak atau kelebihan pola.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Hasil Potong (opsional)
              </label>
              <input
                type="text"
                value={doneNotes}
                onChange={(e) => setDoneNotes(e.target.value)}
                placeholder="Misal: kain sisa 1.5m disimpan di rak gudang"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Otomatisasi Sistem:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li>Upah borongan potong (piecework task) otomatis tercatat ke staf terkait.</li>
                <li>Stage Potong pada Timeline Pesanan akan otomatis ter-update ke Selesai.</li>
              </ul>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setDoneModalItem(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDone}
                disabled={doneSubmitting || doneQty <= 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {doneSubmitting ? 'Memproses...' : 'Konfirmasi Selesai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
