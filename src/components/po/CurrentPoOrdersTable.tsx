import React, { useState } from 'react';
import { Eye, Inbox, AlertTriangle } from 'lucide-react';
import { Order } from '../../types';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import ReleaseEarlyModal from './ReleaseEarlyModal';

interface CurrentPoOrdersTableProps {
  orders: Order[];
  loading: boolean;
  batchStatus?: 'open' | 'closed';
  batchName?: string;
  onSelectOrder: (order: Order) => void;
  onRefresh?: () => void;
}

export const CurrentPoOrdersTable: React.FC<CurrentPoOrdersTableProps> = ({
  orders,
  loading,
  batchStatus,
  batchName,
  onSelectOrder,
  onRefresh,
}) => {
  const { profile } = useCompanySettings();
  const [releasingOrder, setReleasingOrder] = useState<Order | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground animate-pulse">Memuat daftar pesanan PO...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-border bg-card/50 text-center p-6">
        <Inbox className="h-10 w-10 text-muted-foreground/60 mb-2" />
        <p className="text-sm font-semibold text-foreground">Belum ada pesanan dalam Batch PO ini</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Pesanan yang diarahkan ke Batch PO ini akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-card-foreground">
          <thead className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Kode Order</th>
              <th className="py-3 px-4">Tanggal</th>
              <th className="py-3 px-4">Pelanggan</th>
              <th className="py-3 px-4">Sales</th>
              <th className="py-3 px-4">Tipe</th>
              <th className="py-3 px-4 text-right">Total Nilai</th>
              <th className="py-3 px-4">Status Bayar</th>
              <th className="py-3 px-4">Status Produksi</th>
              <th className="py-3 px-4 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => {
              const isPaid = (order as any).remaining_amount <= 0 || order.status === 'lunas';
              const orderType = order.order_type || 'satuan';
              const canReleaseEarly =
                Boolean(profile.po_gate_production) &&
                batchStatus === 'open' &&
                !order.is_rekap_done &&
                !order.released_early_at;

              return (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-foreground">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{order.order_id || (order as any).order_code || String(order.id).slice(0, 8)}</span>
                      {order.released_early_at && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                          title={`Dilepas ke produksi lebih awal pada ${order.released_early_at}`}
                        >
                          <AlertTriangle className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                          Lebih Awal
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                    {order.order_date}
                  </td>
                  <td className="py-3 px-4 font-medium text-foreground">
                    {order.customer_name}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {(order as any).sales_name ? String((order as any).sales_name) : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                        orderType === 'prioritas'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {orderType === 'prioritas' ? 'Prioritas' : 'Satuan'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-foreground whitespace-nowrap">
                    Rp {Number(order.total_price || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isPaid
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      {isPaid ? 'Lunas' : 'Belum Lunas'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="capitalize text-muted-foreground text-[11px]">
                      {String(order.production_status || 'quotation')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onSelectOrder(order)}
                        title="Lihat Detail Pesanan"
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background p-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canReleaseEarly && (
                        <button
                          onClick={() => setReleasingOrder(order)}
                          title="Lepas ke Produksi Lebih Awal"
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 transition-colors"
                        >
                          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                          <span className="hidden sm:inline">Lepas Lebih Awal</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {releasingOrder && (
        <ReleaseEarlyModal
          isOpen={true}
          onClose={() => setReleasingOrder(null)}
          orderId={String(releasingOrder.id)}
          orderCode={releasingOrder.order_id || (releasingOrder as any).order_code}
          poName={batchName}
          onSuccess={() => {
            setReleasingOrder(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
