import React, { useState } from 'react';
import { Scissors, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { CuttingAssignment } from '../../types';

interface CuttingAssignTabProps {
  cuttingAssignments: CuttingAssignment[];
  unassignedOrders: any[];
  staffList: { id: string; name: string; role?: string | null }[];
  loading: boolean;
  onAssign: (orderId: string, staffId: string, notes: string | null) => Promise<void>;
}

export default function CuttingAssignTab({
  cuttingAssignments,
  unassignedOrders,
  staffList,
  loading,
  onAssign,
}: CuttingAssignTabProps) {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter: hanya staff piecework atau tukang potong
  const cuttingStaff = staffList.filter(
    (s) => s.role?.toLowerCase().includes('potong') || s.role?.toLowerCase().includes('cutting')
  );
  // Kalau tidak ada khusus, tampilkan semua piecework
  const displayStaff = cuttingStaff.length > 0 ? cuttingStaff : staffList;

  async function handleAssign() {
    if (!selectedOrderId || !selectedStaffId) {
      setError('Pilih order dan tukang potong terlebih dahulu');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await onAssign(selectedOrderId, selectedStaffId, notes || null);
      const orderLabel = unassignedOrders.find((o) => o.id === selectedOrderId)?.order_id ?? selectedOrderId;
      setSuccess(`Order ${orderLabel} berhasil di-assign.`);
      setSelectedOrderId('');
      setSelectedStaffId('');
      setNotes('');
    } catch (e: any) {
      setError(e.message ?? 'Gagal assign order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
      {/* Daftar assignment yang sudah ada */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Assignment Aktif</h3>
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Memuat assignments...</div>
          ) : cuttingAssignments.length === 0 ? (
            <div className="p-10 text-center">
              <Scissors className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-2 text-sm font-medium text-slate-600">Belum ada assignment potong</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Tukang Potong</th>
                    <th className="px-4 py-3 text-right">Total Qty</th>
                    <th className="px-4 py-3">Tgl Assign</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cuttingAssignments.map((a, idx) => {
                    const orderData = (a as any).orders;
                    const totalQty = orderData?.order_items?.reduce(
                      (s: number, i: any) => s + Number(i.qty),
                      0
                    ) ?? 0;
                    const assignedAt = new Date(a.assigned_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });

                    return (
                      <tr
                        key={a.id}
                        className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {orderData?.order_id ?? '-'}
                          </span>
                          <span className="ml-1 text-xs text-slate-500">
                            ({orderData?.customer_name})
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900">
                          {a.staff?.name ?? '-'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                          {totalQty}{' '}
                          <span className="text-xs font-normal text-muted-foreground">pcs</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">{assignedAt}</td>
                        <td className="px-4 py-3.5 text-center">
                          {a.status === 'reported' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Dilaporkan
                            </span>
                          ) : a.status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                              Lunas
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                              Assigned
                            </span>
                          )}
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

      {/* Form assign baru */}
      <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4 h-fit sticky top-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Scissors className="h-4 w-4 text-primary" />
          Assign Order ke Tukang Potong
        </h3>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Order <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Pilih order --</option>
            {unassignedOrders.map((o) => {
              const totalQty = o.order_items?.reduce(
                (s: number, i: any) => s + Number(i.qty),
                0
              ) ?? 0;
              return (
                <option key={o.id} value={o.id}>
                  {o.order_id} — {o.customer_name} ({totalQty} pcs)
                </option>
              );
            })}
          </select>
          {unassignedOrders.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tidak ada order yang belum di-assign. Semua order aktif sudah punya penanggung jawab.
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
            Catatan (opsional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instruksi khusus, prioritas, dll"
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
          disabled={submitting || !selectedOrderId || !selectedStaffId}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition disabled:opacity-50"
        >
          {submitting ? 'Menyimpan...' : 'Assign'}
        </button>

        <p className="text-[11px] text-muted-foreground text-center">
          Kalau order sudah pernah di-assign, assignment lama akan diganti dengan yang baru.
        </p>
      </div>
    </div>
  );
}
