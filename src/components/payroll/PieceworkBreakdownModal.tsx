import React from 'react';
import { X, Scissors, FileText, CheckCircle2 } from 'lucide-react';
import { formatIDR } from '../../utils/formatCurrency';
import type { PieceworkTask, Staff } from '../../types';

interface PieceworkBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff | null;
  tasks: PieceworkTask[];
}

export default function PieceworkBreakdownModal({
  isOpen,
  onClose,
  staff,
  tasks,
}: PieceworkBreakdownModalProps) {
  if (!isOpen || !staff) return null;

  const totalWage = tasks.reduce((sum, t) => sum + Number(t.total_wage || 0), 0);
  const totalPcs = tasks.reduce((sum, t) => sum + Number(t.qty || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Rincian Borongan: {staff.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {staff.role} • {tasks.length} tugas selesai siap dicairkan
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tasks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada tugas borongan selesai untuk staf ini pada periode ini.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-border text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Tanggal</th>
                    <th className="px-4 py-2.5">Pekerjaan</th>
                    <th className="px-4 py-2.5">Produk / SPK</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Tarif</th>
                    <th className="px-4 py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {task.created_at
                          ? new Date(task.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })
                          : '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {task.task_type === 'cutting' ? (
                            <>
                              <Scissors className="h-3 w-3 text-amber-600" /> Potong
                            </>
                          ) : task.task_type === 'sewing' ? (
                            <>
                              <FileText className="h-3 w-3 text-purple-600" /> Jahit
                            </>
                          ) : (
                            task.task_type
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800 text-xs">
                          {task.products?.name || 'Tugas Umum'}
                        </div>
                        {task.orders && (
                          <div className="text-[10px] text-primary font-mono">
                            {task.orders.order_id}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-xs whitespace-nowrap">
                        {task.qty} pcs
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatIDR(task.rate_per_unit)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs text-slate-900 whitespace-nowrap">
                        {formatIDR(task.total_wage)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary Box */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-border">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Pengerjaan</p>
                <p className="text-sm font-bold text-slate-800">{totalPcs} pcs diselesaikan</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground">Total Hak Upah Borongan</p>
              <p className="text-lg font-black text-primary">{formatIDR(totalWage)}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
