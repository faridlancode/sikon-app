import { Eye, Pencil, Trash2, ShoppingCart } from 'lucide-react';
import OrderStatusBadge from './OrderStatusBadge';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';

export default function OrdersTable({ orders, onView, onEdit, onDelete }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <ShoppingCart className="h-5 w-5 text-slate-400" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">Tidak ada order ditemukan</p>
        <p className="mt-1 text-xs text-slate-400">Coba ubah filter atau tambahkan order baru.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Sales</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Terbayar</th>
              <th className="px-4 py-3 text-right">Sisa</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {orders.map((order) => (
              <tr key={order.id} className="group transition-colors hover:bg-slate-50/80">
                <td className="px-4 py-3.5 font-semibold text-slate-900">{order.order_id}</td>
                <td className="px-4 py-3.5 text-slate-600">{order.customer_name}</td>
                <td className="px-4 py-3.5 text-slate-500">{order.sales_name || '—'}</td>
                <td className="px-4 py-3.5 text-slate-500">{formatDateID(order.order_date)}</td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                  {formatIDR(order.grand_total)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatIDR(order.paid_amount)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums text-amber-700">{formatIDR(order.remaining_amount)}</td>
                <td className="px-4 py-3.5">
                  <OrderStatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => onView(order)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Lihat detail & pembayaran"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onEdit(order)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Edit order"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(order)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="Hapus order"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
