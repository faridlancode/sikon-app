import React, { useState } from 'react';
import { History, Calendar, User, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CuttingWeeklyReport } from '../../types';

interface CuttingReportHistoryProps {
  cuttingReports: CuttingWeeklyReport[];
  loading: boolean;
}

export default function CuttingReportHistory({
  cuttingReports,
  loading,
}: CuttingReportHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('');

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filteredReports = cuttingReports.filter((r) => {
    if (!staffFilter) return true;
    return r.staff?.name.toLowerCase().includes(staffFilter.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Header & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Riwayat Laporan Setoran Potong
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daftar laporan mingguan pemotongan kain dan status pembuatannya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Cari tukang potong..."
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Memuat riwayat laporan...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Belum ada riwayat laporan pemotongan yang tercatat.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const isExpanded = expandedId === report.id;
            const lines = report.cutting_report_lines ?? [];
            const hasWarnings = lines.some(
              (l) =>
                l.expected_qty > 0 &&
                Math.abs(Number(l.reported_qty) - Number(l.expected_qty)) / Number(l.expected_qty) > 0.2
            );

            return (
              <div
                key={report.id}
                className="rounded-xl border border-border bg-white shadow-sm overflow-hidden transition"
              >
                {/* Accordion Bar */}
                <div
                  onClick={() => toggleExpand(report.id)}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-slate-50/70 transition"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">
                          {report.staff?.name || 'Tukang Potong'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            report.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {report.status === 'confirmed' ? 'Dikonfirmasi' : 'Draft'}
                        </span>
                        {hasWarnings && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                            Ada Deviasi
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Periode: {report.period_start} s/d {report.period_end}
                        </span>
                        <span>•</span>
                        <span>Dibuat: {report.created_at ? new Date(report.created_at).toLocaleDateString('id-ID') : '-'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Total Dipotong</span>
                      <span className="text-base font-bold text-slate-900">
                        {Number(report.total_qty).toLocaleString()} pcs
                      </span>
                    </div>
                    <button className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
                    {report.notes && (
                      <div className="rounded-lg bg-white border border-border p-3 text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">Catatan: </span>
                        {report.notes}
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-border bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                          <tr>
                            <th className="px-3 py-2">Order ID</th>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2 text-right">Qty Ekspektasi</th>
                            <th className="px-3 py-2 text-right">Qty Dilaporkan</th>
                            <th className="px-3 py-2">Status / Deviasi</th>
                            <th className="px-3 py-2">Catatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lines.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                                Tidak ada rincian baris
                              </td>
                            </tr>
                          ) : (
                            lines.map((line, idx) => {
                              const rep = Number(line.reported_qty);
                              const exp = Number(line.expected_qty);
                              const diff = rep - exp;
                              const isDeviated =
                                exp > 0 && Math.abs(diff) / exp > 0.2;

                              return (
                                <tr key={idx} className={isDeviated ? 'bg-amber-50/30' : ''}>
                                  <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                                    {(line as any).orders?.order_id ?? line.order_id}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">
                                    {(line as any).orders?.customer_name ?? '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-500">
                                    {exp > 0 ? `${exp.toLocaleString()} pcs` : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                                    {rep.toLocaleString()} pcs
                                  </td>
                                  <td className="px-3 py-2">
                                    {exp > 0 ? (
                                      diff === 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                          <CheckCircle2 className="h-3 w-3" /> Sesuai
                                        </span>
                                      ) : isDeviated ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                                          {diff > 0 ? `+${diff}` : diff} pcs ({Math.round((diff / exp) * 100)}%)
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-slate-500">
                                          {diff > 0 ? `+${diff}` : diff} pcs
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500">
                                    {line.notes || '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
