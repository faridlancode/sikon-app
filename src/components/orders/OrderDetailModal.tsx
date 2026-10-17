import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Trash2, Package, CalendarDays, UserRound, Scissors, ChevronRight, Loader2, Receipt as ReceiptIcon, Printer } from 'lucide-react';
import OrderStatusBadge from './OrderStatusBadge';
import { ProductionStatusBadge } from './OrdersTable';
import OrderTimeline from './OrderTimeline';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { useInvoices } from '../../hooks/useInvoices';
import { useReceipts } from '../../hooks/useReceipts';
import { useNotas } from '../../hooks/useNotas';
import DocumentPreviewModal from '../documents/DocumentPreviewModal';
import ReceiptTemplate from '../documents/ReceiptTemplate';
import NotaTemplate from '../documents/NotaTemplate';
import type { Receipt, Nota } from '../../types';

const PAYMENT_TYPE_LABEL: Record<string, string> = { dp: 'DP', pelunasan: 'Pelunasan' };
const PAYMENT_METHOD_LABEL: Record<string, string> = { transfer: 'Transfer', cash: 'Tunai', qris: 'QRIS', lainnya: 'Lainnya' };

/** Transisi status produksi yang diperbolehkan (hanya maju, tidak bisa mundur) */
const PRODUCTION_TRANSITIONS: Record<string, { next: 'ready' | 'completed'; label: string; className: string } | null> = {
  production: { next: 'ready',     label: 'Tandai Siap Kirim →',    className: 'bg-violet-600 hover:bg-violet-700 text-white' },
  ready:      { next: 'completed', label: 'Tandai Selesai →',       className: 'bg-success hover:bg-success text-white' },
  completed:  null, // sudah selesai, tidak ada transisi lagi
  quotation:  null, // belum ada UI alur untuk ini
  pending:    null,
};

export default function OrderDetailModal({
  open,
  onClose,
  order,
  fetchOrderDetail,
  onAddPayment,
  onDeletePayment,
  onUpdateProductionStatus,
  onPreviewInvoice,
}: {
  open: boolean;
  onClose: () => void;
  order: any;
  fetchOrderDetail: (orderId: string) => Promise<{ items: any[]; payments: any[] }>;
  onAddPayment: (order: any) => void;
  onDeletePayment: (paymentId: string) => Promise<void>;
  onUpdateProductionStatus?: (orderId: string, status: 'ready' | 'completed') => Promise<void>;
  onPreviewInvoice?: (order: any) => void;
}) {
  const navigate = useNavigate();
  const { createInvoiceFromOrder } = useInvoices();
  const { getReceiptByPaymentId } = useReceipts();
  const { getOrCreateNota } = useNotas();
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [localProductionStatus, setLocalProductionStatus] = useState<string>('production');
  const [previewReceipt, setPreviewReceipt] = useState<Receipt | null>(null);
  const [previewNota, setPreviewNota] = useState<Nota | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [loadingNota, setLoadingNota] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    setLocalProductionStatus(order.production_status ?? 'production');
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

  const transition = PRODUCTION_TRANSITIONS[localProductionStatus] ?? null;

  async function handleProductionStatusAdvance() {
    if (!transition || !onUpdateProductionStatus) return;
    setUpdatingStatus(true);
    try {
      await onUpdateProductionStatus(order.id, transition.next);
      setLocalProductionStatus(transition.next);
    } catch (err) {
      console.error('Gagal update production status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleCreateInvoice() {
    try {
      setCreatingInvoice(true);
      await createInvoiceFromOrder(order.id, 'pelunasan');
      onClose();
      navigate('/invoices');
    } catch (err: any) {
      alert(err.message || 'Gagal menerbitkan invoice dari pesanan ini.');
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function handlePreviewReceipt(paymentId: string) {
    try {
      setLoadingReceiptId(paymentId);
      const receipt = await getReceiptByPaymentId(paymentId);
      if (!receipt) {
        alert('Data kwitansi untuk pembayaran ini tidak ditemukan.');
        return;
      }
      setPreviewReceipt(receipt);
    } catch (err: any) {
      console.error('Gagal mengambil kwitansi:', err);
      alert(err.message || 'Gagal memuat kwitansi');
    } finally {
      setLoadingReceiptId(null);
    }
  }

  async function handlePreviewNota() {
    try {
      setLoadingNota(true);
      const nota = await getOrCreateNota(order.id);
      if (!nota) {
        alert('Gagal membuat atau mengambil nota pesanan.');
        return;
      }
      setPreviewNota(nota);
    } catch (err: any) {
      console.error('Gagal mengambil nota:', err);
      alert(err.message || 'Gagal memuat nota pesanan');
    } finally {
      setLoadingNota(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-label="Detail pesanan" className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="border-b border-border bg-muted/50 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-success">Detail pesanan</p>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{order.order_id}</h2>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                    order.order_type === 'satuan'
                      ? 'bg-amber-100 text-amber-800 border border-warning'
                      : 'bg-emerald-100 text-success border border-success-soft'
                  }`}
                >
                  {order.order_type === 'satuan' ? 'Satuan (< 6)' : 'Prioritas (≥ 6)'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{order.customer_name || 'Customer umum'}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDateID(order.order_date)}</span>
                {order.sales_name && <span>Sales: {order.sales_name}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Badge pembayaran & status produksi */}
              <div className="flex items-center gap-2">
                <OrderStatusBadge status={order.status} />
                <ProductionStatusBadge status={order.production_status} />
                <Button variant="ghost" size="sm" aria-label="Tutup detail" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-muted-foreground" title="Tutup detail">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Grand Total</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{formatIDR(order.grand_total)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Terbayar</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-success">{formatIDR(order.paid_amount)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Sisa</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-amber-700">{formatIDR(order.remaining_amount)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Total Qty</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{order.total_qty ?? 0} pcs</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Estimasi HPP</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{totalHpp > 0 ? formatIDR(totalHpp) : '—'}</p>
            </div>
          </div>

          {/* Milestone Timeline Produksi (§8) */}
          <OrderTimeline
            orderId={String(order.id)}
            orderNumber={order.order_id}
            remainingAmount={Number(order.remaining_amount) || 0}
            onRefreshParent={() => {
              if (fetchOrderDetail) {
                fetchOrderDetail(order.id).then(({ items, payments }) => {
                  setItems(items);
                  setPayments(payments);
                });
              }
            }}
          />

          {/* Item order */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Rincian Item &amp; Bahan
            </h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-success border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Tidak ada item.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="bg-muted text-left text-xs font-medium uppercase text-muted-foreground border-b border-border">
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
                        <tr key={item.id} className="align-top hover:bg-muted/50 transition-colors">
                          <td className="px-3.5 py-3">
                            <p className="font-medium text-foreground">{item.name_item}</p>
                            {categoryName && (
                              <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground mt-0.5">
                                {categoryName}
                              </span>
                            )}
                            {Number(item.embroidery_cost_per_unit) > 0 && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-success-soft px-1.5 py-0.5 text-xs font-medium text-success">
                                  <Scissors className="h-3 w-3" />
                                  Bordir: {formatIDR(item.embroidery_cost_per_unit)}
                                  {item.embroidery_details?.mode === "spots" && Array.isArray(item.embroidery_details.spots) && item.embroidery_details.spots.length > 0 && (
                                    <span className="text-success font-normal">
                                      ({item.embroidery_details.spots.map((s: any) => s.location).join(", ")})
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-xs text-muted-foreground">
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
                                      <span className="font-medium text-foreground">
                                        {matName}
                                      </span>
                                      {colorName && (
                                        <span className="text-muted-foreground">
                                          ({colorName})
                                        </span>
                                      )}
                                      <span className="text-muted-foreground">
                                        · {qty} {unit} @ {formatIDR(p)}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : item.bahan ? (
                              <span className="text-muted-foreground">{item.bahan}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums text-foreground font-medium">
                            {item.qty}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums text-muted-foreground">
                            {hppSnapshot > 0 ? formatIDR(hppSnapshot) : "—"}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums text-foreground">
                            {formatIDR(item.price)}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums">
                            {hppSnapshot > 0 ? (
                              <span
                                className={`text-xs font-medium ${marginPerUnit >= 0
                                    ? "text-success"
                                    : "text-destructive"
                                  }`}
                              >
                                {formatIDR(marginPerUnit)}
                                {marginPct !== null && (
                                  <span className="block text-xs text-muted-foreground font-normal">
                                    ({marginPct}%)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-right tabular-nums font-semibold text-foreground">
                            {formatIDR(subtotalLine)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted">
                    <tr>
                      <td colSpan={6} className="px-3.5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total margin estimasi</td>
                      <td className={`px-3.5 py-3 text-right font-bold tabular-nums ${totalMargin >= 0 ? 'text-success' : 'text-destructive'}`}>{totalHpp > 0 ? formatIDR(totalMargin) : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Riwayat pembayaran */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Riwayat Pembayaran</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Total masuk: {formatIDR(order.paid_amount)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (onPreviewInvoice) {
                      onPreviewInvoice(order);
                    } else {
                      handleCreateInvoice();
                    }
                  }}
                  disabled={creatingInvoice}
                  className="gap-1.5 text-xs text-primary border-border hover:bg-accent"
                  title="Pratinjau & cetak invoice penagihan dari pesanan ini"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak Invoice
                </Button>
                {order.status === 'lunas' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePreviewNota}
                    disabled={loadingNota}
                    className="gap-1.5 text-xs text-success border-success-soft hover:bg-emerald-50"
                    title="Pratinjau & cetak nota pesanan lunas"
                  >
                    {loadingNota ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Printer className="h-3.5 w-3.5" />
                    )}
                    Cetak Nota
                  </Button>
                )}
                {order.status === 'belum_lunas' && (
                  <Button size="sm" onClick={() => onAddPayment(order)}>
                    <Plus className="h-3.5 w-3.5" /> Catat Pembayaran
                  </Button>
                )}
              </div>
            </div>

            {!loading && payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
                <Package className="h-5 w-5 text-border" />
                <p className="mt-2 text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {payments.map((payment: any) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap gap-3 items-center justify-between rounded-lg border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {PAYMENT_TYPE_LABEL[payment.payment_type] || payment.payment_type} · {formatIDR(payment.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateID(payment.payment_date)}
                        {payment.payment_method && ` · ${PAYMENT_METHOD_LABEL[payment.payment_method] || payment.payment_method}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm"
                        type="button"
                        onClick={() => handlePreviewReceipt(payment.id)}
                        disabled={loadingReceiptId === payment.id}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground border border-border transition-colors disabled:opacity-50"
                        title="Pratinjau & cetak kwitansi pembayaran ini"
                      >
                        {loadingReceiptId === payment.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ReceiptIcon className="h-3 w-3 text-success" />
                        )}
                        <span>Kwitansi</span>
                      </Button>
                      <Button variant="ghost" size="sm"
                        onClick={() => handleDeletePayment(payment.id)}
                        disabled={deletingId === payment.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-destructive disabled:opacity-50"
                        title="Hapus pembayaran"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Modal Pratinjau & Cetak Kwitansi Pembayaran */}
      {previewReceipt && (
        <DocumentPreviewModal
          isOpen={Boolean(previewReceipt)}
          onClose={() => setPreviewReceipt(null)}
          title="Pratinjau Kwitansi Pembayaran"
          documentNo={previewReceipt.receipt_no}
          customerName={previewReceipt.customer_name}
          documentType="Kwitansi"
        >
          {(printMode) => (
            <ReceiptTemplate receipt={previewReceipt} printMode={printMode} />
          )}
        </DocumentPreviewModal>
      )}

      {/* Modal Pratinjau & Cetak Nota Pesanan Lunas */}
      {previewNota && (
        <DocumentPreviewModal
          isOpen={Boolean(previewNota)}
          onClose={() => setPreviewNota(null)}
          title="Pratinjau Nota Pesanan"
          documentNo={previewNota.nota_no}
          customerName={previewNota.customer_name}
          documentType="Nota Pesanan"
        >
          {(printMode) => (
            <NotaTemplate nota={previewNota} printMode={printMode} />
          )}
        </DocumentPreviewModal>
      )}
    </div>
  );
}
