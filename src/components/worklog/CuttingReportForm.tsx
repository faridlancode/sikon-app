import React, { useState, useMemo } from 'react';
import { ClipboardList, Plus, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import type { CuttingAssignment } from '../../types';
import type { CuttingReportLine } from '../../hooks/useCuttingWorklog';

interface CuttingReportFormProps {
  staffList: { id: string; name: string; role?: string | null }[];
  cuttingAssignments: CuttingAssignment[];
  loading: boolean;
  onSubmit: (
    staffId: string,
    periodStart: string,
    periodEnd: string,
    lines: CuttingReportLine[],
    notes: string | null
  ) => Promise<{ report_id: string; total_qty: number; warnings: any[] }>;
}

interface LineState {
  order_id: string;
  reported_qty: string;
  notes: string;
  expected_qty: number;
  order_label: string;
}

export default function CuttingReportForm({
  staffList,
  cuttingAssignments,
  loading,
  onSubmit,
}: CuttingReportFormProps) {
  const today = new Date().toISOString().split('T')[0];
  const lastSaturday = (() => {
    const d = new Date();
    const day = d.getDay(); // 0=Sun, 6=Sat
    const diffToSat = day === 0 ? -1 : 6 - day;
    d.setDate(d.getDate() + diffToSat);
    return d.toISOString().split('T')[0];
  })();
  const lastMonday = (() => {
    const d = new Date(lastSaturday);
    d.setDate(d.getDate() - 5);
    return d.toISOString().split('T')[0];
  })();

  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [periodStart, setPeriodStart] = useState(lastMonday);
  const [periodEnd, setPeriodEnd] = useState(lastSaturday);
  const [lines, setLines] = useState<LineState[]>([]);
  const [reportNotes, setReportNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Prefill: assignments untuk staff yang dipilih
  const assignedOrders = useMemo(() => {
    if (!selectedStaffId) return [];
    return cuttingAssignments.filter(
      (a) => a.staff_id === selectedStaffId && a.status === 'assigned'
    );
  }, [selectedStaffId, cuttingAssignments]);

  function handlePrefill() {
    const prefilled: LineState[] = assignedOrders.map((a) => {
      const orderData = (a as any).orders;
      const totalQty = orderData?.order_items?.reduce(
        (s: number, i: any) => s + Number(i.qty),
        0
      ) ?? 0;
      return {
        order_id: a.order_id,
        reported_qty: String(totalQty),
        notes: '',
        expected_qty: totalQty,
        order_label: `${orderData?.order_id ?? a.order_id} — ${orderData?.customer_name ?? ''}`,
      };
    });
    setLines(prefilled);
  }

  function addManualLine() {
    setLines((prev) => [
      ...prev,
      { order_id: '', reported_qty: '', notes: '', expected_qty: 0, order_label: '' },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof LineState, value: string) {
    setLines((prev) => {
      const next = [...prev];
      (next[idx] as any)[field] = value;
      // Kalau order_id berubah, cari expected_qty dari assignments
      if (field === 'order_id') {
        const found = cuttingAssignments.find((a) => a.order_id === value);
        if (found) {
          const orderData = (found as any).orders;
          const totalQty = orderData?.order_items?.reduce(
            (s: number, i: any) => s + Number(i.qty),
            0
          ) ?? 0;
          next[idx].expected_qty = totalQty;
          next[idx].order_label = `${orderData?.order_id ?? value} — ${orderData?.customer_name ?? ''}`;
        } else {
          next[idx].expected_qty = 0;
          next[idx].order_label = value;
        }
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!selectedStaffId) {
      setError('Pilih tukang potong');
      return;
    }
    if (lines.length === 0) {
      setError('Tambahkan minimal 1 baris laporan');
      return;
    }
    const invalidLines = lines.filter((l) => !l.order_id || l.reported_qty === '');
    if (invalidLines.length > 0) {
      setError('Lengkapi order dan reported_qty untuk setiap baris');
      return;
    }
    setError(null);
    setWarnings([]);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(
        selectedStaffId,
        periodStart,
        periodEnd,
        lines.map((l) => ({
          order_id: l.order_id,
          reported_qty: parseFloat(l.reported_qty) || 0,
          notes: l.notes || undefined,
        })),
        reportNotes || null
      );
      setSuccessMsg(
        `Laporan berhasil disimpan. Total: ${result.total_qty} pcs. ${result.warnings.length > 0 ? `${result.warnings.length} peringatan.` : ''}`
      );
      if (result.warnings.length > 0) setWarnings(result.warnings);
      setLines([]);
      setReportNotes('');
    } catch (e: any) {
      setError(e.message ?? 'Gagal menyimpan laporan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header Form */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Form Setoran Potong Mingguan
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Tukang Potong <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => {
                setSelectedStaffId(e.target.value);
                setLines([]);
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Pilih --</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.role ? `(${s.role})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Periode Mulai</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Periode Selesai</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {selectedStaffId && assignedOrders.length > 0 && (
          <button
            onClick={handlePrefill}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition"
          >
            <ClipboardList className="h-4 w-4" />
            Prefill dari Assignment ({assignedOrders.length} order)
          </button>
        )}
      </div>

      {/* Lines */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            Rincian Setoran ({lines.length} baris)
          </span>
          <button
            onClick={addManualLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-muted transition"
          >
            <Plus className="h-3.5 w-3.5" /> Tambah Baris
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Klik "Prefill dari Assignment" atau "Tambah Baris" untuk mulai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5 text-right">Qty Dilaporkan</th>
                  <th className="px-4 py-2.5 text-right">Qty Ekspektasi</th>
                  <th className="px-4 py-2.5">Catatan</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  const repQty = parseFloat(line.reported_qty) || 0;
                  const hasWarning =
                    line.expected_qty > 0 &&
                    Math.abs(repQty - line.expected_qty) / line.expected_qty > 0.2;

                  return (
                    <tr key={idx} className={hasWarning ? 'bg-amber-50/40' : ''}>
                      <td className="px-4 py-2.5 min-w-[220px]">
                        {line.order_label ? (
                          <div className="text-sm font-medium text-slate-800">
                            {line.order_label}
                          </div>
                        ) : (
                          <select
                            value={line.order_id}
                            onChange={(e) => updateLine(idx, 'order_id', e.target.value)}
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                          >
                            <option value="">-- Pilih order --</option>
                            {cuttingAssignments.map((a) => {
                              const orderData = (a as any).orders;
                              const totalQty = orderData?.order_items?.reduce(
                                (s: number, i: any) => s + Number(i.qty),
                                0
                              ) ?? 0;
                              return (
                                <option key={a.order_id} value={a.order_id}>
                                  {orderData?.order_id ?? a.order_id} — {orderData?.customer_name} ({totalQty} pcs)
                                </option>
                              );
                            })}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          value={line.reported_qty}
                          onChange={(e) => updateLine(idx, 'reported_qty', e.target.value)}
                          className={`w-24 rounded-lg border px-2 py-1.5 text-right text-sm font-bold focus:outline-none ${
                            hasWarning
                              ? 'border-amber-400 bg-amber-50 text-amber-900'
                              : 'border-border bg-white text-slate-900'
                          }`}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`text-sm font-semibold ${
                            hasWarning ? 'text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          {line.expected_qty > 0 ? line.expected_qty : '-'}
                          {hasWarning && (
                            <AlertTriangle className="inline ml-1 h-3.5 w-3.5 text-amber-500" />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={line.notes}
                          onChange={(e) => updateLine(idx, 'notes', e.target.value)}
                          placeholder="Catatan..."
                          className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => removeLine(idx)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Notes & Submit */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Catatan Laporan (opsional)
          </label>
          <textarea
            value={reportNotes}
            onChange={(e) => setReportNotes(e.target.value)}
            rows={2}
            placeholder="Keterangan umum laporan minggu ini..."
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-medium">
            ✓ {successMsg}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || lines.length === 0}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition disabled:opacity-50"
        >
          {submitting ? 'Menyimpan laporan...' : 'Konfirmasi & Simpan Laporan'}
        </button>
        <p className="text-[11px] text-center text-muted-foreground">
          Laporan yang dikonfirmasi akan otomatis menghasilkan piecework tasks untuk payroll.
        </p>
      </div>
    </div>
  );
}
