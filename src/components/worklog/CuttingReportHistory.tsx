import React, { useState } from 'react';
import { History, User, CheckCircle2, Scissors, Search } from 'lucide-react';
import type { CuttingAssignment } from '../../types';

interface CuttingReportHistoryProps {
  cuttingAssignments: CuttingAssignment[];
  loading: boolean;
}

export default function CuttingReportHistory({
  cuttingAssignments,
  loading,
}: CuttingReportHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Saring hanya assignment yang statusnya 'done'
  const doneAssignments = cuttingAssignments.filter((a) => a.status === 'done');

  const filtered = doneAssignments.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const staffName = a.staff?.name?.toLowerCase() || '';
    const orderNum = a.order_items?.orders?.order_id?.toLowerCase() || '';
    const customer = a.order_items?.orders?.customer_name?.toLowerCase() || '';
    const itemName = a.order_items?.name_item?.toLowerCase() || '';
    return (
      staffName.includes(term) ||
      orderNum.includes(term) ||
      customer.includes(term) ||
      itemName.includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Riwayat Pemotongan Kain
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daftar seluruh item yang telah selesai dipotong dan tercatat upah borongannya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari order / staf / item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-lg border border-border bg-white pl-8 pr-3 py-1.5 text-xs focus:border-primary focus:outline-none w-56"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Memuat riwayat pemotongan...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Belum ada riwayat pemotongan kain yang selesai.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Order & Item</th>
                  <th className="px-4 py-3">Tukang Potong</th>
                  <th className="px-4 py-3 text-right">Target</th>
                  <th className="px-4 py-3 text-right">Qty Terpotong</th>
                  <th className="px-4 py-3">Tgl Ditandai Selesai</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a, idx) => {
                  const item = a.order_items;
                  const orderData = item?.orders;
                  const completedAt = item?.cutting_completed_at
                    ? new Date(item.cutting_completed_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-';

                  return (
                    <tr
                      key={a.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
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
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium text-slate-900">{a.staff?.name ?? '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-slate-500">
                        {item?.qty ?? 0} pcs
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-700">
                        {item?.cutting_qty ?? item?.qty ?? 0} pcs
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{completedAt}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Selesai
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
