import React, { useMemo } from 'react';
import { User, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { SewingAssignment } from '../../types';

interface SewingAssignmentsTabProps {
  assignments: SewingAssignment[];
  loading: boolean;
}

export default function SewingAssignmentsTab({
  assignments,
  loading,
}: SewingAssignmentsTabProps) {
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
        });
      }
      const entry = map.get(staffId)!;
      entry.assignments.push(a);
      entry.totalAssigned += a.assigned_qty;
      entry.totalPassed += a.qc_passed_qty;
      entry.totalRejected += a.qc_rejected_qty;
      entry.totalSewn += a.sewn_qty;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.staff.name.localeCompare(b.staff.name)
    );
  }, [assignments]);

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
      {byStaff.map(({ staff, assignments: staffAssignments, totalAssigned, totalPassed, totalRejected }) => {
        const activeQty = totalAssigned - totalPassed;
        const rejectRate =
          totalAssigned > 0 ? ((totalRejected / totalAssigned) * 100).toFixed(1) : '0.0';
        const passRate =
          totalAssigned > 0 ? ((totalPassed / totalAssigned) * 100).toFixed(1) : '0.0';

        return (
          <div
            key={staff.id}
            className="rounded-xl border border-border bg-white shadow-sm overflow-hidden"
          >
            {/* Staff Header */}
            <div className="flex items-center justify-between gap-4 border-b border-border bg-slate-50/60 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {staff.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{staff.name}</p>
                  <p className="text-xs text-muted-foreground">{staff.role ?? 'Penjahit'}</p>
                </div>
              </div>
              {/* Summary chips */}
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
                    <th className="px-4 py-2 text-right">Lolos QC</th>
                    <th className="px-4 py-2 text-right">Reject</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffAssignments.map((a) => {
                    const orderData = (a as any).order_items?.orders;
                    const itemName = (a as any).order_items?.name_item ?? 'Item';

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
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                          {a.qc_passed_qty}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-rose-600">
                          {a.qc_rejected_qty > 0 ? a.qc_rejected_qty : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {a.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Selesai
                            </span>
                          ) : a.status === 'in_progress' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 border border-blue-200">
                              <Clock className="h-2.5 w-2.5" /> Sedang Dikerjakan
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                              <AlertTriangle className="h-2.5 w-2.5" /> Belum Mulai
                            </span>
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
    </div>
  );
}
