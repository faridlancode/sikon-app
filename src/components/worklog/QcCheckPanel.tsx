import React, { useState, useMemo } from 'react';
import { ClipboardCheck, Search, AlertCircle } from 'lucide-react';
import type { SewingAssignment } from '../../types';

interface QcCheckPanelProps {
  assignments: SewingAssignment[];
  loading: boolean;
  onRecordQc: (
    assignmentId: string,
    passedQty: number,
    rejectedQty: number,
    notes: string | null
  ) => Promise<void>;
}

export default function QcCheckPanel({
  assignments,
  loading,
  onRecordQc,
}: QcCheckPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<SewingAssignment | null>(null);
  const [passedQty, setPassedQty] = useState('');
  const [rejectedQty, setRejectedQty] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hanya tampilkan bundel yang belum 'completed' (masih perlu QC)
  const activeAssignments = useMemo(() => {
    return assignments.filter((a) => a.status !== 'completed');
  }, [assignments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return activeAssignments;
    const q = search.toLowerCase();
    return activeAssignments.filter((a) => {
      const name = a.staff?.name?.toLowerCase() ?? '';
      const itemName = ((a as any).order_items?.name_item ?? '').toLowerCase();
      const orderId = ((a as any).order_items?.orders?.order_id ?? '').toLowerCase();
      return name.includes(q) || itemName.includes(q) || orderId.includes(q);
    });
  }, [activeAssignments, search]);

  async function handleSubmit() {
    if (!selectedAssignment) return;
    const passed = parseFloat(passedQty) || 0;
    const rejected = parseFloat(rejectedQty) || 0;
    if (passed + rejected <= 0) {
      setError('Masukkan minimal 1 qty (lolos atau reject)');
      return;
    }
    if (passed < 0 || rejected < 0) {
      setError('Qty tidak boleh negatif');
      return;
    }
    const remaining =
      selectedAssignment.assigned_qty - selectedAssignment.qc_passed_qty;
    if (passed + rejected > remaining) {
      setError(
        `Total qty (${passed + rejected}) melebihi sisa bundel yang belum diperiksa (${remaining})`
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onRecordQc(selectedAssignment.id, passed, rejected, qcNotes || null);
      setSelectedAssignment(null);
      setPassedQty('');
      setRejectedQty('');
      setQcNotes('');
    } catch (e: any) {
      setError(e.message ?? 'Gagal menyimpan QC check');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
      {/* Daftar bundel */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari penjahit, item, atau no order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Memuat bundel...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-2 text-sm font-medium text-slate-600">
                {activeAssignments.length === 0
                  ? 'Tidak ada bundel yang perlu diperiksa'
                  : 'Tidak ada bundel yang cocok dengan pencarian'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((a) => {
                const remaining = a.assigned_qty - a.qc_passed_qty;
                const isSelected = selectedAssignment?.id === a.id;
                const itemName = (a as any).order_items?.name_item ?? 'Item';
                const orderId = (a as any).order_items?.orders?.order_id ?? '';
                const custName = (a as any).order_items?.orders?.customer_name ?? '';

                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedAssignment(a);
                      setPassedQty('');
                      setRejectedQty('');
                      setQcNotes('');
                      setError(null);
                    }}
                    className={`w-full text-left px-5 py-4 transition-colors hover:bg-primary/5 ${
                      isSelected ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 truncate">{itemName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.staff?.name}
                          {orderId && (
                            <>
                              {' · '}
                              <span className="font-mono text-primary">{orderId}</span>
                              {custName && <span className="text-slate-400"> ({custName})</span>}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-semibold text-amber-700">
                          {remaining} pcs belum QC
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {a.qc_passed_qty}/{a.assigned_qty} lolos
                          {a.qc_rejected_qty > 0 && (
                            <span className="ml-1 text-rose-500">• {a.qc_rejected_qty} reject</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Form input QC */}
      <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4 h-fit sticky top-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Input Hasil QC
        </h3>

        {!selectedAssignment ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Pilih bundel jahit dari daftar sebelah kiri
            </p>
          </div>
        ) : (
          <>
            {/* Info bundel */}
            <div className="rounded-lg border border-border bg-slate-50 p-3 space-y-1 text-sm">
              <p className="font-semibold text-slate-900">
                {(selectedAssignment as any).order_items?.name_item ?? 'Item'}
              </p>
              <p className="text-xs text-muted-foreground">
                Penjahit: <span className="font-medium text-slate-700">{selectedAssignment.staff?.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Target:{' '}
                <span className="font-semibold text-slate-800">{selectedAssignment.assigned_qty} pcs</span>{' '}
                · Lolos sebelumnya:{' '}
                <span className="font-semibold text-emerald-700">{selectedAssignment.qc_passed_qty}</span>
                {selectedAssignment.qc_rejected_qty > 0 && (
                  <>
                    {' '}· Reject:{' '}
                    <span className="font-semibold text-rose-600">{selectedAssignment.qc_rejected_qty}</span>
                  </>
                )}
              </p>
              <p className="text-xs font-bold text-amber-700">
                Sisa belum diperiksa:{' '}
                {selectedAssignment.assigned_qty - selectedAssignment.qc_passed_qty} pcs
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-emerald-700">
                  Qty Lolos QC
                </label>
                <input
                  type="number"
                  min="0"
                  value={passedQty}
                  onChange={(e) => setPassedQty(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-bold text-emerald-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-rose-700">
                  Qty Reject
                </label>
                <input
                  type="number"
                  min="0"
                  value={rejectedQty}
                  onChange={(e) => setRejectedQty(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-rose-300 bg-rose-50/40 px-3 py-2 text-sm font-bold text-rose-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Catatan (opsional)
              </label>
              <textarea
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                placeholder="Keterangan hasil pemeriksaan..."
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedAssignment(null);
                  setError(null);
                }}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-muted transition"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Hasil QC'}
              </button>
            </div>

            {(parseFloat(rejectedQty) > 0) && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Pcs yang reject akan dikembalikan ke penjahit yang sama untuk rework. Bundel akan tetap aktif sampai semua pcs lolos QC.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
