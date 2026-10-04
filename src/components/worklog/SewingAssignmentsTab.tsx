import React, { useMemo, useState } from 'react';
import { User, AlertTriangle, CheckCircle2, Clock, Play, Package, AlertCircle, Loader2, X } from 'lucide-react';
import type { SewingAssignment } from '../../types';

interface SewingAssignmentsTabProps {
  assignments: SewingAssignment[];
  loading: boolean;
  onStartAssignment?: (id: string, force?: boolean, forceReason?: string) => Promise<void>;
  onStartAll?: (staffId?: string, force?: boolean) => Promise<void>;
}

export default function SewingAssignmentsTab({
  assignments,
  loading,
  onStartAssignment,
  onStartAll,
}: SewingAssignmentsTabProps) {
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startingStaffId, setStartingStaffId] = useState<string | null>(null);

  // State untuk modal Paksa Mulai (force override)
  const [forceModalAssignment, setForceModalAssignment] = useState<SewingAssignment | null>(null);
  const [forceReason, setForceReason] = useState('');
  const [forceLoading, setForceLoading] = useState(false);
  const [forceError, setForceError] = useState('');

  // State feedback skip count dari startAll
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);

  // Kelompokkan assignment per penjahit
  const byStaff = useMemo(() => {
    const map = new Map<
      string,
      {
        staff: { id: string; name: string; role?: string | null };
        assignments: SewingAssignment[];
        totalAssigned: number;
        totalPassed: number;
        totalRejected: number;
        totalSewn: number;
        pendingStartCount: number;
        waitingMaterialCount: number; // assigned + belum dispatch + ada BOM
      }
    >();

    for (const a of assignments) {
      const staffId = a.staff_id;
      const staffName = a.staff?.name ?? 'Tidak Diketahui';
      if (!map.has(staffId)) {
        map.set(staffId, {
          staff: { id: staffId, name: staffName, role: a.staff?.role },
          assignments: [],
          totalAssigned: 0,
          totalPassed: 0,
          totalRejected: 0,
          totalSewn: 0,
          pendingStartCount: 0,
          waitingMaterialCount: 0,
        });
      }
      const entry = map.get(staffId)!;
      entry.assignments.push(a);
      entry.totalAssigned += a.assigned_qty;
      entry.totalPassed += a.qc_passed_qty;
      entry.totalRejected += a.qc_rejected_qty;
      entry.totalSewn += a.sewn_qty;
      if (a.status === 'assigned') {
        entry.pendingStartCount += 1;
        // Jika material_dispatched_at null → masih menunggu bahan gudang
        if (!a.material_dispatched_at) {
          entry.waitingMaterialCount += 1;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.staff.name.localeCompare(b.staff.name)
    );
  }, [assignments]);

  async function handleStartSingle(a: SewingAssignment) {
    if (!onStartAssignment) return;
    // Jika belum dispatch, tampilkan modal konfirmasi force
    if (a.status === 'assigned' && !a.material_dispatched_at) {
      setForceModalAssignment(a);
      setForceReason('');
      setForceError('');
      return;
    }
    setStartingId(a.id);
    try {
      await onStartAssignment(a.id);
    } finally {
      setStartingId(null);
    }
  }

  async function handleForceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forceModalAssignment || !onStartAssignment) return;
    if (!forceReason.trim()) {
      setForceError('Alasan wajib diisi untuk memaksa mulai sebelum bahan diserahkan.');
      return;
    }
    setForceLoading(true);
    setForceError('');
    try {
      await onStartAssignment(forceModalAssignment.id, true, forceReason.trim());
      setForceModalAssignment(null);
      setForceReason('');
    } catch (err: any) {
      setForceError(err.message || 'Gagal memaksa mulai');
    } finally {
      setForceLoading(false);
    }
  }

  async function handleStartStaffAll(staffId: string) {
    if (!onStartAll) return;
    setStartingStaffId(staffId);
    setSkipFeedback(null);
    try {
      await onStartAll(staffId);
    } finally {
      setStartingStaffId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Memuat beban penjahit...
      </div>
    );
  }

  if (byStaff.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-12 text-center shadow-sm">
        <User className="mx-auto h-10 w-10 text-slate-200" />
        <p className="mt-3 text-sm font-medium text-slate-600">Belum ada pembagian kerja</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Gunakan tab "Antrian Jahit" dan klik "Bagikan Kerja" terlebih dahulu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Feedback skip dari startAll */}
      {skipFeedback && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            {skipFeedback}
          </div>
          <button onClick={() => setSkipFeedback(null)} className="text-amber-600 hover:text-amber-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {byStaff.map(({ staff, assignments: staffAssignments, totalAssigned, totalPassed, totalRejected, pendingStartCount, waitingMaterialCount }) => {
        const activeQty = totalAssigned - totalPassed;
        const rejectRate =
          totalAssigned > 0 ? ((totalRejected / totalAssigned) * 100).toFixed(1) : '0.0';
        const passRate =
          totalAssigned > 0 ? ((totalPassed / totalAssigned) * 100).toFixed(1) : '0.0';

        // Berapa assigned yang sudah bisa dimulai (dispatch sudah atau tidak perlu dispatch)
        const readyToStart = pendingStartCount - waitingMaterialCount;

        return (
          <div
            key={staff.id}
            className="rounded-xl border border-border bg-white shadow-sm overflow-hidden"
          >
            {/* Staff Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border bg-slate-50/60 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {staff.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{staff.name}</p>
                  <p className="text-xs text-muted-foreground">{staff.role ?? 'Penjahit'}</p>
                </div>
              </div>

              {/* Summary chips & Quick action */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                  Target: <span className="text-slate-900">{totalAssigned} pcs</span>
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  Lolos QC: {totalPassed} pcs ({passRate}%)
                </span>
                {totalRejected > 0 && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
                    Reject: {totalRejected} pcs ({rejectRate}%)
                  </span>
                )}
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold border ${
                    activeQty > 0
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  Beban aktif: {activeQty} pcs
                </span>

                {/* Badge menunggu bahan */}
                {waitingMaterialCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                    <Package className="h-2.5 w-2.5" />
                    {waitingMaterialCount} menunggu bahan gudang
                  </span>
                )}

                {/* Tombol Mulai Semua — hanya untuk yang bahan sudah siap */}
                {readyToStart > 0 && onStartAll && (
                  <button
                    onClick={() => handleStartStaffAll(staff.id)}
                    disabled={startingStaffId === staff.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 font-semibold shadow-xs transition disabled:opacity-50 ml-1"
                    title={`Mulai ${readyToStart} tugas jahit yang bahannya sudah siap`}
                  >
                    <Play className="h-3 w-3 fill-current" />
                    {startingStaffId === staff.id ? 'Memproses...' : `Mulai Semua yang Siap (${readyToStart})`}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-5 py-2 bg-white border-b border-slate-100">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-emerald-400 transition-all"
                  style={{ width: `${Math.min(100, (totalPassed / Math.max(totalAssigned, 1)) * 100)}%` }}
                />
                <div
                  className="bg-rose-300 transition-all"
                  style={{ width: `${Math.min(100, (totalRejected / Math.max(totalAssigned, 1)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Assignments detail */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-2">Item</th>
                    <th className="px-4 py-2">Order</th>
                    <th className="px-4 py-2 text-right">Target</th>
                    <th className="px-4 py-2 text-right">Tarif/pcs</th>
                    <th className="px-4 py-2 text-right">Lolos QC</th>
                    <th className="px-4 py-2 text-right">Reject</th>
                    <th className="px-4 py-2 text-center">Status Bahan & Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffAssignments.map((a) => {
                    const orderData = (a as any).order_items?.orders;
                    const itemName = (a as any).order_items?.name_item ?? 'Item';
                    const rate = a.applied_sewing_rate || (a as any).order_items?.products?.sewing_cost_per_pcs;
                    const needsDispatch = a.status === 'assigned' && !a.material_dispatched_at;
                    const isStarting = startingId === a.id;

                    return (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-2.5 font-medium text-slate-800">{itemName}</td>
                        <td className="px-4 py-2.5">
                          {orderData ? (
                            <span className="font-mono font-semibold text-primary">
                              {orderData.order_id}
                              <span className="ml-1 font-sans font-normal text-slate-400">
                                ({orderData.customer_name})
                              </span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                          {a.assigned_qty}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">
                          {rate != null ? `Rp ${Number(rate).toLocaleString('id-ID')}` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                          {a.qc_passed_qty}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-rose-600">
                          {a.qc_rejected_qty > 0 ? a.qc_rejected_qty : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {a.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Selesai
                            </span>
                          ) : a.status === 'in_progress' ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800 border border-blue-200">
                                <Clock className="h-2.5 w-2.5" /> Sedang Dikerjakan
                              </span>
                              {/* Badge: override dicatat di notes */}
                              {a.notes && a.notes.includes('[PAKSA MULAI:') && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-700 border border-rose-200">
                                  ⚠ Override
                                </span>
                              )}
                            </div>
                          ) : (
                            // assigned — belum mulai
                            <div className="flex flex-col items-center gap-1.5">
                              {/* Badge status bahan */}
                              {needsDispatch ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                  <Package className="h-2.5 w-2.5" />
                                  ⏳ Tunggu Bahan Gudang
                                </span>
                              ) : a.material_dispatched_at ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Bahan Diterima {new Date(a.material_dispatched_at).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Belum Mulai
                                </span>
                              )}

                              {/* Tombol aksi */}
                              <div className="flex items-center gap-1">
                                {onStartAssignment && !needsDispatch && (
                                  <button
                                    onClick={() => handleStartSingle(a)}
                                    disabled={isStarting}
                                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 text-[10px] font-bold shadow-xs transition disabled:opacity-50"
                                    title="Ubah status jadi sedang dikerjakan"
                                  >
                                    {isStarting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5 fill-current" />}
                                    {isStarting ? '...' : 'Mulai Jahit'}
                                  </button>
                                )}

                                {/* Tombol Paksa Mulai — hanya jika bahan belum diserahkan */}
                                {onStartAssignment && needsDispatch && (
                                  <button
                                    onClick={() => {
                                      setForceModalAssignment(a);
                                      setForceReason('');
                                      setForceError('');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold transition"
                                    title="Paksa mulai sebelum bahan diserahkan — perlu alasan Supervisor"
                                  >
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    Paksa Mulai
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Modal Paksa Mulai (Supervisor Force Override) */}
      {forceModalAssignment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setForceModalAssignment(null); }}
        >
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Paksa Mulai Jahit (Supervisor)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Bahan untuk{' '}
                  <strong>{(forceModalAssignment as any).order_items?.name_item ?? 'item ini'}</strong>{' '}
                  belum diserahkan gudang. Mulai sebelum bahan siap memerlukan alasan resmi.
                </p>
              </div>
              <button
                onClick={() => setForceModalAssignment(null)}
                className="ml-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleForceSubmit} className="px-5 py-4 space-y-4">
              {forceError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {forceError}
                </div>
              )}
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠ Dampak Override</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Status berubah ke <strong>Sedang Dikerjakan</strong> sebelum stok gudang tercatat keluar</li>
                  <li>Alasan akan disimpan di catatan penugasan ini</li>
                  <li>Gudang tetap wajib menyelesaikan serah terima bahan</li>
                </ul>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Alasan Override *
                </label>
                <textarea
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  placeholder="Contoh: Gudang sedang berhalangan, bahan sudah tersedia secara fisik tapi belum sempat diinput sistem..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 resize-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setForceModalAssignment(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={forceLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 px-5 py-2 text-sm font-bold text-white transition disabled:opacity-60 cursor-pointer"
                >
                  {forceLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Memproses...</>
                  ) : (
                    'Paksa Mulai Sekarang'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
