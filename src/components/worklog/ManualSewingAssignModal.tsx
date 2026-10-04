import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Users,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { Staff, OrderItem } from '../../types';

interface PriorityOrderSummary {
  orderId: string;
  orderNumber: string;
  customerName: string;
  items: OrderItem[];
  totalRemainingQty: number;
}

interface ManualSewingAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PriorityOrderSummary | null;
  staffList: Staff[];
  staffLoads?: Record<string, number>;
  onAssign: (
    orderId: string,
    staffIds: string[],
    quotas: number[],
    notes: string | null
  ) => Promise<void>;
}

export default function ManualSewingAssignModal({
  isOpen,
  onClose,
  order,
  staffList,
  staffLoads = {},
  onAssign,
}: ManualSewingAssignModalProps) {
  const [selectedStaffMap, setSelectedStaffMap] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter tailors
  const activeTailors = useMemo(() => {
    return staffList.filter((s) => {
      const role = (s.role || '').toLowerCase();
      const isSewing =
        role.includes('jahit') || role.includes('sewing') || role.includes('penjahit');
      return s.is_active && (s.wage_type === 'piecework' || isSewing);
    });
  }, [staffList]);

  // Total allocated vs needed
  const totalNeeded = order?.totalRemainingQty || 0;
  const totalAllocated = useMemo(() => {
    return Object.values(selectedStaffMap).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [selectedStaffMap]);

  const diff = totalNeeded - totalAllocated;
  const isExact = totalNeeded > 0 && totalAllocated === totalNeeded;

  // Auto-init recommendation when modal opens
  useEffect(() => {
    if (isOpen && order && activeTailors.length > 0) {
      setNotes('');
      setErrorMsg(null);

      // Sort tailors based on fair queue: last_priority_assigned_at ASC nulls first, then current load ASC
      const sorted = [...activeTailors].sort((a, b) => {
        const timeA = a.last_priority_assigned_at ? new Date(a.last_priority_assigned_at).getTime() : 0;
        const timeB = b.last_priority_assigned_at ? new Date(b.last_priority_assigned_at).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        const loadA = staffLoads[a.id] || 0;
        const loadB = staffLoads[b.id] || 0;
        return loadA - loadB;
      });

      const numTailors = Math.min(3, Math.max(1, Math.floor(totalNeeded / 5)));
      const chosen = sorted.slice(0, numTailors);

      const base = Math.floor(totalNeeded / numTailors);
      const remainder = totalNeeded - base * numTailors;

      const initialMap: Record<string, number> = {};
      chosen.forEach((tailor, idx) => {
        initialMap[tailor.id] = base + (idx < remainder ? 1 : 0);
      });

      setSelectedStaffMap(initialMap);
    }
  }, [isOpen, order, activeTailors, staffLoads, totalNeeded]);

  if (!isOpen || !order) return null;

  function handleToggleStaff(staffId: string) {
    setSelectedStaffMap((prev) => {
      const next = { ...prev };
      if (next[staffId] !== undefined) {
        delete next[staffId];
      } else {
        next[staffId] = 0;
      }
      return next;
    });
  }

  function handleQuotaChange(staffId: string, val: string) {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setSelectedStaffMap((prev) => ({
      ...prev,
      [staffId]: num,
    }));
  }

  function handleAutoDistributeSelected() {
    const ids = Object.keys(selectedStaffMap);
    if (ids.length === 0) return;

    const base = Math.floor(totalNeeded / ids.length);
    const remainder = totalNeeded - base * ids.length;

    const newMap: Record<string, number> = {};
    ids.forEach((id, idx) => {
      newMap[id] = base + (idx < remainder ? 1 : 0);
    });
    setSelectedStaffMap(newMap);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setErrorMsg(null);

    const selectedIds = Object.keys(selectedStaffMap).filter((id) => (selectedStaffMap[id] || 0) > 0);
    const quotas = selectedIds.map((id) => selectedStaffMap[id]);

    if (selectedIds.length === 0) {
      setErrorMsg('Pilih minimal 1 penjahit dengan kuota > 0');
      return;
    }

    if (totalAllocated !== totalNeeded) {
      setErrorMsg(
        `Total alokasi (${totalAllocated} pcs) harus sama dengan sisa antrian order (${totalNeeded} pcs)`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onAssign(order.orderId, selectedIds, quotas, notes.trim() || null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan penugasan manual');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Penugasan Jahit Manual (Supervisor Override)
              </h2>
              <p className="text-xs text-muted-foreground">
                Tentukan penjahit spesialis & sesuaikan kuota pcs sesuai kebutuhan pesanan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-700 border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Order Info Card */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {order.orderNumber}
                </span>
                <span className="font-semibold text-slate-900 text-sm">{order.customerName}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-slate-500">Total Sisa Antri:</span>{' '}
                <span className="text-base font-black text-primary">{totalNeeded} pcs</span>
              </div>
            </div>

            {/* List of items */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {order.items.map((it) => (
                <span
                  key={it.id}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs border border-slate-200 text-slate-700 shadow-2xs"
                >
                  <Layers className="h-3 w-3 text-slate-400" />
                  <span className="font-medium">{it.name_item || (it as any).products?.name}</span>
                  <span className="font-bold text-slate-900">({it.qty} pcs)</span>
                </span>
              ))}
            </div>
          </div>

          {/* Tailor Selection & Quota Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Pilih Penjahit & Alokasi Pcs
                </label>
              </div>
              <button
                type="button"
                onClick={handleAutoDistributeSelected}
                disabled={Object.keys(selectedStaffMap).length === 0}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Bagi Rata Penjahit Terpilih
              </button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 w-10 text-center">Pilih</th>
                    <th className="px-4 py-2.5">Penjahit</th>
                    <th className="px-4 py-2.5 text-center">Beban Aktif</th>
                    <th className="px-4 py-2.5 text-xs text-slate-500">Terakhir Prioritas</th>
                    <th className="px-4 py-2.5 text-right w-36">Alokasi (pcs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTailors.map((tailor) => {
                    const isSelected = selectedStaffMap[tailor.id] !== undefined;
                    const quota = selectedStaffMap[tailor.id] ?? 0;
                    const load = staffLoads[tailor.id] || 0;
                    const lastAssigned = tailor.last_priority_assigned_at
                      ? new Date(tailor.last_priority_assigned_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Belum pernah';

                    return (
                      <tr
                        key={tailor.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-primary/5' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleStaff(tailor.id)}
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{tailor.name}</p>
                          <p className="text-[11px] text-muted-foreground">{tailor.role || 'Penjahit'}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              load === 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : load < 15
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {load} pcs
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {lastAssigned}
                          {tailor.priority_orders_count ? (
                            <span className="ml-1 text-[10px] text-slate-400">
                              ({tailor.priority_orders_count}x)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max={totalNeeded}
                              disabled={!isSelected}
                              value={isSelected ? quota : ''}
                              placeholder={isSelected ? '0' : '-'}
                              onChange={(e) => handleQuotaChange(tailor.id, e.target.value)}
                              className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-right text-sm font-bold text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100 disabled:opacity-50"
                            />
                            <span className="text-xs text-muted-foreground">pcs</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Allocation Progress Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600">Status Alokasi Total</span>
              <span
                className={`flex items-center gap-1 ${
                  isExact
                    ? 'text-emerald-700'
                    : diff > 0
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {isExact ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Pas ({totalAllocated} / {totalNeeded} pcs)
                  </>
                ) : diff > 0 ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Kurang {diff} pcs ({totalAllocated} / {totalNeeded} pcs)
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    Kelebihan {Math.abs(diff)} pcs ({totalAllocated} / {totalNeeded} pcs)
                  </>
                )}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full transition-all duration-300 ${
                  isExact ? 'bg-emerald-600' : totalAllocated > totalNeeded ? 'bg-rose-500' : 'bg-primary'
                }`}
                style={{
                  width: `${Math.min(100, (totalAllocated / (totalNeeded || 1)) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Catatan Penugasan (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Khusus jaket drill diprioritaskan selesai besok sore"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !isExact}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <UserCheck className="h-4 w-4" />
              {submitting ? 'Menyimpan...' : 'Simpan & Distribusikan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
