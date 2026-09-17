import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Package, CalendarDays, UserRound, Scissors } from 'lucide-react';
import OrderStatusBadge from './OrderStatusBadge';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';

const PAYMENT_TYPE_LABEL = { dp: 'DP', pelunasan: 'Pelunasan' };
const PAYMENT_METHOD_LABEL = { transfer: 'Transfer', cash: 'Tunai', qris: 'QRIS', lainnya: 'Lainnya' };

export default function OrderDetailModal({ open, onClose, order, fetchOrderDetail, onAddPayment, onDeletePayment }) {
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    fetchOrderDetail(order.id)
      .then(({ items, payments }) => {
        setItems(items);
        setPayments(payments);
      })
      .finally(() => setLoading(false));
  }, [open, order, fetchOrderDetail]);

  if (!open || !order) return null;

  const totalHpp = items.reduce((total, item) => {
    return total + (Number(item.qty) || 0) * (Number(item.hpp_per_unit_snapshot) || 0);
  }, 0);
  const totalMargin = items.reduce((total, item) => {
    const qty = Number(item.qty) || 0;
    return total + qty * ((Number(item.price) || 0) - (Number(item.hpp_per_unit_snapshot) || 0));
  }, 0);

  async function handleDeletePayment(paymentId) {
    if (!window.confirm('Hapus pembayaran ini? Entri pemasukan terkait di Financial juga akan terhapus.')) return;
    setDeletingId(paymentId);
    try {
      await onDeletePayment(paymentId);
      setPayments((list) => list.filter((p) => p.id !== paymentId));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Detail pesanan</p>
              <h2 className="text-lg font-bold text-slate-900">{order.order_id}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{order.customer_name || 'Customer umum'}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDateID(order.order_date)}</span>
                {order.sales_name && <span>Sales: {order.sales_name}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" title="Tutup detail">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Grand Total</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{formatIDR(order.grand_total)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Terbayar</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">{formatIDR(order.paid_amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Sisa</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-amber-700">{formatIDR(order.remaining_amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Total Qty</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{order.total_qty ?? 0} pcs</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Estimasi HPP</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{totalHpp > 0 ? formatIDR(totalHpp) : '—'}</p>
            </div>
          </div>

          {/* Item order */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Rincian Item &amp; Bahan
            </h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Tidak ada item.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-400 border-b border-slate-200">
                      <th className="px-3.5 py-2.5">Item &amp; Model</th>
                      <th className="px-3.5 py-2.5">Kain &amp; Warna</th>
                      <th className="px-3.5 py-2.5 text-right">Qty</th>
                      <th className="px-3.5 py-2.5 text-right">HPP / Unit</th>
                      <th className="px-3.5 py-2.5 text-right">Harga Jual</th>
                      <th className="px-3.5 py-2.5 text-right">Margin / Unit</th>
                      <th className="px-3.5 py-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const fabrics = item.order_item_fabrics ?? [];
                      const hppSnapshot = Number(item.hpp_per_unit_snapshot) || 0;
                      const priceNum = Number(item.price) || 0;
                      const marginPerUnit = priceNum - hppSnapshot;
                      const marginPct =
                        priceNum > 0 && hppSnapshot > 0
                          ? Math.round((marginPerUnit / priceNum) * 100)
                          : null;
                      const subtotalLine = (Number(item.qty) || 0) * priceNum;
                      const categoryName =
                        item.products?.product_categories?.name || null;

                      return (
                        <tr key={item.id} className="align-top hover:bg-slate-50/50 transition-colors">
                          <td className="px-3.5 py-3">
                            <p className="font-medium text-slate-900">{item.name_item}</p>
                            {categoryName && (
                              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 mt-0.5">
                                {categoryName}
                              </span>
                            )}
                            {Number(item.embroidery_cost_per_unit) > 0 && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                                  <Scissors className="h-3 w-3" />
                                  Bordir: {formatIDR(item.embroidery_cost_per_unit)}
                                  {item.embroidery_details?.mode === "spots" && Array.isArray(item.embroidery_details.spots) && item.embroidery_details.spots.length > 0 && (
                                    <span className="text-emerald-700 font-normal">
                                      ({item.embroidery_details.spots.map((s: any) => s.location).join(", ")})
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-xs text-slate-600">
                            {fabrics.length > 0 ? (
                              <ul className="space-y-1">
                                {fabrics.map((f: any, idx: number) => {
                                  const matName = f.materials?.name || "Kain";
                                  const colorName = f.material_colors?.color_name;
                                  const qty = f.usage_qty_snapshot;
                                  const unit = f.materials?.unit || "m";
                                  const p = f.price_snapshot;

                                  return (
                                    <li key={f.id || idx} className="flex items-center gap-1">
                                      <span className="font-medium text-slate-800">
                                        {matName}
                                      </span>
                                      {colorName && (
                                        <span className="text-slate-500">
                                          ({colorName})
                                        </span>
                                      )}
                                      <span className="text-slate-400">
                                        · {qty} {unit} @ {formatIDR(p)}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : item.bahan ? (
                              <span className="text-slate-500">{item.bahan}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums text-slate-700 font-medium">
                            {item.qty}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums text-slate-600">
                            {hppSnapshot > 0 ? formatIDR(hppSnapshot) : "—"}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums text-slate-700">
                            {formatIDR(item.price)}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums">
                            {hppSnapshot > 0 ? (
                              <span
                                className={`text-xs font-medium ${marginPerUnit >= 0
                                    ? "text-emerald-700"
                                    : "text-rose-600"
                                  }`}
                              >
                                {formatIDR(marginPerUnit)}
                                {marginPct !== null && (
                                  <span className="block text-[10px] text-slate-400 font-normal">
                                    ({marginPct}%)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums font-semibold text-slate-900">
                            {formatIDR(subtotalLine)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr>
                      <td colSpan={6} className="px-3.5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total margin estimasi</td>
                      <td className={`px-3.5 py-3 text-right font-bold tabular-nums ${totalMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{totalHpp > 0 ? formatIDR(totalMargin) : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Riwayat pembayaran */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Riwayat Pembayaran</h3>
                <p className="mt-0.5 text-xs text-slate-400">Total masuk: {formatIDR(order.paid_amount)}</p>
              </div>
              {order.status === 'belum_lunas' && (
                <Button size="sm" onClick={() => onAddPayment(order)}>
                  <Plus className="h-3.5 w-3.5" /> Catat Pembayaran
                </Button>
              )}
            </div>

            {!loading && payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <Package className="h-5 w-5 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Belum ada pembayaran tercatat.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {PAYMENT_TYPE_LABEL[payment.payment_type]} · {formatIDR(payment.amount)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateID(payment.payment_date)}
                        {payment.payment_method && ` · ${PAYMENT_METHOD_LABEL[payment.payment_method] || payment.payment_method}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeletePayment(payment.id)}
                      disabled={deletingId === payment.id}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      title="Hapus pembayaran"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
