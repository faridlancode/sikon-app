import React, { useState } from 'react';
import { Scissors, AlertCircle, CheckCircle2, Check, Clock, User, ChevronRight } from 'lucide-react';
import type { CuttingAssignment } from '../../types';

interface CuttingAssignTabProps {
  cuttingAssignments: CuttingAssignment[];
  unassignedItems: any[];
  staffList: { id: string; name: string; role?: string | null }[];
  loading: boolean;
  onAssign: (orderItemId: string, staffId: string, notes: string | null) => Promise<void>;
  onMarkDone: (orderItemId: string, cuttingQty: number | null, notes: string | null) => Promise<void>;
}

export default function CuttingAssignTab({
  cuttingAssignments,
  unassignedItems,
  staffList,
  loading,
  onAssign,
  onMarkDone,
}: CuttingAssignTabProps) {
  const [selectedItemId, setSelectedItemId] = useState('');
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

  // Active assignments (hanya yang statusnya 'assigned' ditampilkan di tab aktif)
  const activeAssignments = cuttingAssignments.filter((a) => a.status === 'assigned');

  async function handleAssign() {
    if (!selectedItemId || !selectedStaffId) {
      setError('Pilih item order dan tukang potong terlebih dahulu');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await onAssign(selectedItemId, selectedStaffId, notes || null);
      const chosenItem = unassignedItems.find((i) => i.id === selectedItemId);
      const itemLabel = chosenItem ? `${chosenItem.orders?.order_id || 'Order'} - ${chosenItem.name_item}` : 'Item';
      setSuccess(`${itemLabel} berhasil di-assign ke tukang potong.`);
      setSelectedItemId('');
      setSelectedStaffId('');
      setNotes('');
    } catch (e: any) {
      setError(e.message ?? 'Gagal assign item potong');
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
      setSuccess(`Item ${doneModalItem.name_item} ditandai selesai dipotong. Upah borongan otomatis dicatat.`);
      setDoneModalItem(null);
    } catch (e: any) {
      setError(e.message ?? 'Gagal menandai item selesai');
    } finally {
      setDoneSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
      {/* Kolom Kiri: Daftar Assignment Aktif */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />
            Tugas Potong Sedang Berjalan ({activeAssignments.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Event-driven: Tandai selesai langsung saat kain beres dipotong
          </span>
        </div>

        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Memuat daftar tugas potong...</div>
          ) : activeAssignments.length === 0 ? (
            <div className="p-10 text-center">
              <Scissors className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-2 text-sm font-medium text-slate-600">Tidak ada tugas potong yang sedang aktif</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pilih item dari panel kanan untuk menugaskan tukang potong.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Order & Item</th>
                    <th className="px-4 py-3">Tukang Potong</th>
                    <th className="px-4 py-3 text-right">Target Qty</th>
                    <th className="px-4 py-3">Tgl Assign</th>
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
                    });

                    return (
                      <tr
                        key={a.id}
                        className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-primary">
                              {orderData?.order_id ?? '-'}
                            </span>
                            <span className="text-xs text-slate-500">
                              • {orderData?.customer_name || 'Pelanggan'}
                            </span>
                          </div>
                          <div className="font-medium text-slate-800 text-sm mt-0.5">
                            {item?.name_item || 'Item'}
                          </div>
                          {a.notes && (
                            <div className="text-[11px] text-slate-400 italic mt-0.5">
                              Catatan: {a.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-medium text-slate-900">{a.staff?.name ?? '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                          {item?.qty ?? 0}{' '}
                          <span className="text-xs font-normal text-muted-foreground">pcs</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">{assignedAt}</td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => openDoneModal(a)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
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

      {/* Kolom Kanan: Form Assign Baru */}
      <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4 h-fit sticky top-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Scissors className="h-4 w-4 text-primary" />
          Assign Item ke Tukang Potong
        </h3>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Item Order Antri Potong <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Pilih item order --</option>
            {unassignedItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.orders?.order_id || 'Order'} — {item.name_item} ({item.qty} pcs) [{item.orders?.customer_name}]
              </option>
            ))}
          </select>
          {unassignedItems.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tidak ada item yang menunggu pemotongan. Semua item aktif sudah di-assign atau telah selesai dipotong.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Tukang Potong <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Pilih tukang potong --</option>
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
            placeholder="Instruksi pola, susut kain, dsb"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            {success}
          </div>
        )}

        <button
          onClick={handleAssign}
          disabled={submitting || !selectedItemId || !selectedStaffId}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition disabled:opacity-50"
        >
          {submitting ? 'Menyimpan Assignment...' : 'Assign ke Tukang Potong'}
        </button>

        <p className="text-[11px] text-muted-foreground text-center">
          1 item hanya memiliki 1 penanggung jawab potong aktif sekaligus.
        </p>
      </div>

      {/* Modal Mini: Konfirmasi Tandai Selesai */}
      {doneModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Scissors className="h-5 w-5 text-emerald-600" />
                Konfirmasi Selesai Potong
              </h4>
              <button
                onClick={() => setDoneModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 bg-slate-50 p-3 rounded-lg text-xs text-slate-600">
              <p>
                <strong className="text-slate-900">Order:</strong> {doneModalItem.order_id || '-'}
              </p>
              <p>
                <strong className="text-slate-900">Item:</strong> {doneModalItem.name_item}
              </p>
              <p>
                <strong className="text-slate-900">Target Order Qty:</strong> {doneModalItem.qty} pcs
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
                Sesuaikan jika ada kain rusak atau kelebihan pola.
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
                placeholder="Misal: kain sisa 1.5m disimpan di gudang"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 space-y-1">
              <p className="font-semibold">Otomatisasi Sistem:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Upah borongan potong (piecework task) langsung di-generate untuk staf ini.</li>
                <li>Stage Potong pada Timeline Order akan otomatis ter-update ke in_progress / done.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDoneModalItem(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDone}
                disabled={doneSubmitting || doneQty <= 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
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
