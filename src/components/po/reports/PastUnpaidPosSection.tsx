import React, { useState } from 'react';
import { Clock, ChevronDown, ChevronRight, User, ShoppingBag } from 'lucide-react';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID } from '../../../utils/dateHelpers';
import { formatPoDateRange } from '../poHelpers';
import type { PastUnpaidPoItem } from '../../../types';

interface PastUnpaidPosSectionProps {
  unpaidPos?: PastUnpaidPoItem[];
  isPrint?: boolean;
}

export default function PastUnpaidPosSection({
  unpaidPos = [],
  isPrint = false,
}: PastUnpaidPosSectionProps) {
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>(() => {
    // Default expanded all so user can immediately see details
    const init: Record<string, boolean> = {};
    unpaidPos.forEach((p) => {
      init[p.batch_id] = true;
    });
    return init;
  });

  if (!unpaidPos || unpaidPos.length === 0) {
    return null;
  }

  const grandTotalRemaining = unpaidPos.reduce(
    (acc, curr) => acc + (Number(curr.remaining_amount) || 0),
    0
  );
  const totalUnpaidOrders = unpaidPos.reduce(
    (acc, curr) => acc + (Number(curr.unpaid_orders_count) || 0),
    0
  );

  function toggleBatch(batchId: string) {
    setExpandedBatchIds((prev) => ({
      ...prev,
      [batchId]: !prev[batchId],
    }));
  }

  // ==========================================
  // PRINT LAYOUT (Landscape-friendly & detailed)
  // ==========================================
  if (isPrint) {
    return (
      <div className="border border-amber-300 dark:border-amber-700/50 rounded-lg overflow-hidden break-inside-avoid my-3">
        <div className="bg-amber-100/80 px-3 py-1.5 font-bold text-xs uppercase border-b border-amber-300 flex justify-between items-center text-amber-950">
          <div className="flex items-center gap-1.5">
            <span>Rincian Sisa Pelunasan PO Terdahulu (Belum Lunas)</span>
          </div>
          <span className="text-[10px] font-normal text-amber-900">
            {unpaidPos.length} Batch PO &bull; {totalUnpaidOrders} Order Belum Lunas &bull; Total Sisa: {formatIDR(grandTotalRemaining)}
          </span>
        </div>

        <div className="divide-y divide-amber-200">
          {unpaidPos.map((po) => {
            const orders = po.unpaid_orders || [];
            return (
              <div key={po.batch_id} className="p-2 bg-amber-50/20">
                {/* Header per Batch PO */}
                <div className="flex items-center justify-between bg-amber-100/60 px-2.5 py-1 rounded text-xs mb-1.5 font-semibold text-amber-950">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-900">{po.name || po.code}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">({po.code})</span>
                    <span className="text-[10px] font-normal text-amber-800">
                      &bull; {formatDateID(po.start_date)} – {formatDateID(po.end_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-muted-foreground">
                      Nilai PO: <span className="font-mono text-foreground">{formatIDR(po.total_booking_and_ongkir)}</span>
                    </span>
                    <span className="text-emerald-700">
                      Terbayar: <span className="font-mono font-medium">{formatIDR(po.total_paid)}</span>
                    </span>
                    <span className="font-bold text-rose-700">
                      Sisa Tagihan: <span className="font-mono">{formatIDR(po.remaining_amount)}</span>
                    </span>
                  </div>
                </div>

                {/* Sub-table Rincian Order Belum Lunas */}
                {orders.length > 0 ? (
                  <table className="w-full text-[11px] border border-border/60 rounded overflow-hidden">
                    <thead className="bg-muted/40 text-muted-foreground border-b border-border/60">
                      <tr>
                        <th className="py-1 px-2 text-left font-medium w-8">No</th>
                        <th className="py-1 px-2 text-left font-medium w-28">No. Order</th>
                        <th className="py-1 px-2 text-left font-medium w-24">Tgl Order</th>
                        <th className="py-1 px-2 text-left font-medium">Nama Pelanggan</th>
                        <th className="py-1 px-2 text-left font-medium w-28">Sales</th>
                        <th className="py-1 px-2 text-right font-medium w-16">Qty (Pcs)</th>
                        <th className="py-1 px-2 text-right font-medium w-28">Grand Total</th>
                        <th className="py-1 px-2 text-right font-medium w-28">Terbayar</th>
                        <th className="py-1 px-2 text-right font-bold text-rose-700 w-32">Sisa Tagihan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 bg-card">
                      {orders.map((ord, idx) => (
                        <tr key={ord.id || ord.order_id} className="hover:bg-muted/10">
                          <td className="py-1 px-2 text-muted-foreground text-center">{idx + 1}</td>
                          <td className="py-1 px-2 font-mono font-medium text-foreground">{ord.order_id}</td>
                          <td className="py-1 px-2 text-muted-foreground">{formatDateID(ord.order_date)}</td>
                          <td className="py-1 px-2 font-medium text-foreground">{ord.customer_name}</td>
                          <td className="py-1 px-2 text-foreground">{ord.sales_name || '-'}</td>
                          <td className="py-1 px-2 text-right font-mono">{Number(ord.total_pcs || 0).toLocaleString('id-ID')}</td>
                          <td className="py-1 px-2 text-right font-mono text-muted-foreground">{formatIDR(ord.grand_total)}</td>
                          <td className="py-1 px-2 text-right font-mono text-emerald-600">{formatIDR(ord.paid_amount)}</td>
                          <td className="py-1 px-2 text-right font-mono font-bold text-rose-600 bg-rose-50/40">
                            {formatIDR(ord.remaining_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic px-2 py-1">
                    Semua pesanan pada batch PO ini telah lunas.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Grand Total Footer */}
        <div className="bg-amber-100/90 px-3 py-2 border-t-2 border-amber-300 flex justify-between items-center text-xs font-bold text-amber-950">
          <span className="uppercase font-black">TOTAL SISA PIUTANG PO SEBELUMNYA</span>
          <div className="flex items-center gap-4">
            <span className="font-normal text-amber-900">{totalUnpaidOrders} Pesanan Belum Lunas</span>
            <span className="font-mono font-black text-rose-700 text-sm">{formatIDR(grandTotalRemaining)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // WEB / SCREEN LAYOUT
  // ==========================================
  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-800/60 bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 px-4 py-3 gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
            Sisa Pelunasan PO Terdahulu yang Belum Lunas
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-amber-800 dark:text-amber-300">
            {unpaidPos.length} Batch PO &bull; {totalUnpaidOrders} Order Belum Lunas
          </span>
          <span className="rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 font-bold font-mono">
            Total Piutang: {formatIDR(grandTotalRemaining)}
          </span>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {unpaidPos.map((po) => {
          const isExpanded = expandedBatchIds[po.batch_id] !== false;
          const orders = po.unpaid_orders || [];
          return (
            <div key={po.batch_id} className="p-3 bg-card transition-colors">
              {/* Batch PO Row Header (Clickable) */}
              <div
                onClick={() => toggleBatch(po.batch_id)}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-950/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-amber-700 dark:text-amber-400 p-0.5 hover:bg-amber-200/60 rounded"
                    aria-label={isExpanded ? 'Tutup rincian' : 'Buka rincian'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <span className="font-bold text-sm text-foreground">
                    {po.name || po.code}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">({po.code})</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    &bull; {formatPoDateRange(po.start_date, po.end_date)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
                  <span className="text-muted-foreground hidden md:inline">
                    Nilai: <span className="font-mono text-foreground font-medium">{formatIDR(po.total_booking_and_ongkir)}</span>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 hidden sm:inline">
                    Terbayar: <span className="font-mono font-medium">{formatIDR(po.total_paid)}</span>
                  </span>
                  <span className="rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 font-bold font-mono text-xs">
                    Sisa: {formatIDR(po.remaining_amount)}
                  </span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    ({orders.length} order)
                  </span>
                </div>
              </div>

              {/* Rincian Pesanan Belum Lunas */}
              {isExpanded && (
                <div className="mt-2.5 overflow-x-auto rounded-lg border border-border">
                  {orders.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                        <tr>
                          <th className="py-2 px-3 text-left font-medium w-10">No</th>
                          <th className="py-2 px-3 text-left font-medium">No. Order</th>
                          <th className="py-2 px-3 text-left font-medium">Tgl Order</th>
                          <th className="py-2 px-3 text-left font-medium">Pelanggan</th>
                          <th className="py-2 px-3 text-left font-medium">Sales</th>
                          <th className="py-2 px-3 text-right font-medium">Jumlah (Pcs)</th>
                          <th className="py-2 px-3 text-right font-medium">Total Tagihan</th>
                          <th className="py-2 px-3 text-right font-medium">Sudah Dibayar</th>
                          <th className="py-2 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                            Sisa Tagihan
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {orders.map((ord, idx) => (
                          <tr key={ord.id || ord.order_id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 text-center text-muted-foreground">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono font-medium text-foreground">{ord.order_id}</td>
                            <td className="py-2 px-3 text-muted-foreground">{formatDateID(ord.order_date)}</td>
                            <td className="py-2 px-3 font-medium text-foreground">{ord.customer_name}</td>
                            <td className="py-2 px-3 text-muted-foreground">{ord.sales_name || '-'}</td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-foreground">
                              {Number(ord.total_pcs || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                              {formatIDR(ord.grand_total)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                              {formatIDR(ord.paid_amount)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20">
                              {formatIDR(ord.remaining_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-3 text-center text-xs text-muted-foreground italic">
                      Tidak ada order yang belum lunas pada batch PO ini.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 border-t-2 border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <span className="text-xs font-black uppercase text-foreground">
          TOTAL SISA PIUTANG PO SEBELUMNYA
        </span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">{totalUnpaidOrders} Order Belum Lunas</span>
          <span className="text-sm font-mono font-black text-rose-600 dark:text-rose-400">
            {formatIDR(grandTotalRemaining)}
          </span>
        </div>
      </div>
    </div>
  );
}
