import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, AlertCircle, CheckCircle2, RotateCcw, Trash2, X } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/card';
import Button from '../components/ui/button';
import OrderFilters from '../components/orders/OrderFilters';
import OrdersTable from '../components/orders/OrdersTable';
import OrderModal from '../components/orders/OrderModal';
import OrderDetailModal from '../components/orders/OrderDetailModal';
import PaymentModal from '../components/orders/PaymentModal';
import OrderDepositReleaseModal from '../components/orders/OrderDepositReleaseModal';
import { useOrders } from '../hooks/useOrders';
import { useSales } from '../hooks/useSales';
import { useProductCategories } from '../hooks/useProductCategories';
import { useInvoices } from '../hooks/useInvoices';
import { useCompanySettings } from '../hooks/useCompanySettings';
import PdfPreviewDialog from '../components/documents/PdfPreviewDialog';
import { getInvoicePdfBlobUrl, downloadInvoicePdf } from '../lib/pdf/invoicePdf';
import type { SignatureMode } from '../lib/pdf/invoicePdf';
import { formatIDR } from '../utils/formatCurrency';
import { supabase } from '../lib/supabaseClient';
import type { Invoice } from '../types';

const DEFAULT_FILTERS = {
  status: 'all',
  search: '',
  po: 'all',
};

function formatDatabaseErrorMessage(msg: string): string {
  if (!msg) return 'Terjadi kesalahan pada database.';
  // Ganti pola "Rp 500000" atau "Rp500000" dengan format ribuan "Rp 500.000"
  return msg.replace(/Rp\s*(\d+)/gi, (_, digits) => {
    const num = parseInt(digits, 10);
    return isNaN(num) ? `Rp ${digits}` : formatIDR(num);
  });
}

export default function OrdersPage() {
  const {
    orders,
    loading,
    createOrder,
    updateOrder,
    deleteOrder,
    releaseDeposit,
    fetchOrderDetail,
    recordPayment,
    deletePayment,
    updateProductionStatus,
  } = useOrders();
  const { activeSales } = useSales();
  const { categories: productCategories } = useProductCategories();

  const location = useLocation();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [editingItems, setEditingItems] = useState<any[]>([]);
  const [convertingQuotation, setConvertingQuotation] = useState<any | null>(null);

  // Deteksi navigasi "Konversi ke Pesanan" dari halaman Penawaran
  useEffect(() => {
    const quotationFromState = (location.state as any)?.convertFromQuotation;
    if (quotationFromState) {
      setConvertingQuotation(quotationFromState);
      setEditingOrder(null);
      setEditingItems([]);
      setFormModalOpen(true);
      // Bersihkan location.state agar reload tidak memicu modal lagi
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [paymentOrder, setPaymentOrder] = useState<any | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Hook Invoices untuk pratinjau & cetak invoice pesanan
  const { createInvoiceFromOrder, getInvoiceDetail } = useInvoices();
  const { profile } = useCompanySettings();
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('none');
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [keterangan, setKeterangan] = useState('');

  // Generate / revoke blob URL saat previewInvoice atau signatureMode berubah
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    if (previewInvoice) {
      setPdfBlobUrl(null);
      getInvoicePdfBlobUrl(previewInvoice, profile, signatureMode, keterangan).then(u => {
        if (!active) { URL.revokeObjectURL(u); return; }
        url = u;
        setPdfBlobUrl(u);
      }).catch(console.error);
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewInvoice, signatureMode, keterangan]);

  async function handleDownloadInvoice() {
    if (!previewInvoice) return;
    try { setDownloadingInvoice(true); await downloadInvoicePdf(previewInvoice, profile, signatureMode, keterangan); }
    catch (e) { console.error(e); } finally { setDownloadingInvoice(false); }
  }

  // Modal Pelepasan Uang Muka / DP Hangus
  const [releaseOrder, setReleaseOrder] = useState<any | null>(null);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);

  // Dialog Konfirmasi Hapus Order
  const [deletingOrder, setDeletingOrder] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Banner Notifikasi UI (pengganti alert bawaan)
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  } | null>(null);

  function showNotification(
    type: 'success' | 'error',
    message: string,
    action?: { label: string; onClick: () => void }
  ) {
    setNotification({ type, message, action });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 8000);
  }

  const availablePoCodes = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const name = o.po_name || o.po_code;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.status !== 'all' && order.status !== filters.status) return false;
      if (filters.po && filters.po !== 'all') {
        const orderPo = order.po_name || order.po_code;
        if (orderPo !== filters.po) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${order.order_id} ${order.customer_name} ${order.sales_name ?? ''} ${order.po_name ?? ''} ${order.po_code ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filters]);

  const statusCounts = useMemo(
    () => ({
      all: orders.length,
      belum_lunas: orders.filter((o) => o.status === 'belum_lunas').length,
      lunas: orders.filter((o) => o.status === 'lunas').length,
    }),
    [orders]
  );

  function openAddModal() {
    setConvertingQuotation(null);
    setEditingOrder(null);
    setEditingItems([]);
    setFormModalOpen(true);
  }

  async function openEditModal(order: any) {
    setConvertingQuotation(null);
    const { items } = await fetchOrderDetail(order.id);
    setEditingOrder(order);
    setEditingItems(items);
    setFormModalOpen(true);
  }

  async function handleFormSubmit(payload: any) {
    if (editingOrder) {
      await updateOrder(editingOrder.id, payload);
      showNotification('success', `Order ${editingOrder.order_id} berhasil diperbarui.`);
    } else {
      const newOrder = await createOrder(payload);
      await recordPayment(newOrder.id, payload.payment);

      if (convertingQuotation) {
        try {
          const { error: linkErr } = await supabase.rpc('link_quotation_to_order', {
            p_quotation_id: convertingQuotation.id,
            p_order_id: newOrder.id,
          });
          if (linkErr) {
            console.error('Gagal menautkan penawaran ke pesanan:', linkErr);
          } else {
            showNotification(
              'success',
              `Order ${newOrder.order_id} berhasil dibuat dan ditautkan ke Penawaran ${convertingQuotation.quotation_no}.`
            );
          }
        } catch (e) {
          console.error('Error rpc link_quotation_to_order:', e);
        } finally {
          setConvertingQuotation(null);
        }
      } else {
        showNotification('success', `Order ${newOrder.order_id} berhasil dibuat.`);
      }
    }
  }

  function handlePromptDelete(order: any) {
    setDeletingOrder(order);
  }

  async function handleConfirmDelete() {
    if (!deletingOrder) return;
    setIsDeleting(true);
    const orderToDelete = deletingOrder;
    try {
      await deleteOrder(orderToDelete.id);
      setDeletingOrder(null);
      showNotification('success', `Order ${orderToDelete.order_id} berhasil dihapus.`);
    } catch (err: any) {
      setDeletingOrder(null);
      const rawMsg = err.message || 'Gagal menghapus order.';
      const formattedMsg = formatDatabaseErrorMessage(rawMsg);

      // Jika order gagal dihapus karena masih memegang uang, tampilkan tombol aksi cepat buka modal
      if (rawMsg.toLowerCase().includes('memegang uang')) {
        showNotification('error', formattedMsg, {
          label: 'Kembalikan Uang / DP Hangus',
          onClick: () => {
            setReleaseOrder(orderToDelete);
            setReleaseModalOpen(true);
          },
        });
      } else {
        showNotification('error', formattedMsg);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  function openDetailModal(order: any) {
    setDetailOrder(order);
    setDetailModalOpen(true);
  }

  async function handlePreviewInvoice(order: any) {
    try {
      setLoadingInvoice(true);
      // createInvoiceFromOrder bersifat idempotent, akan menyinkronkan data invoice pesanan terkini
      const invId = await createInvoiceFromOrder(order.id, 'pelunasan');
      const invoiceData = await getInvoiceDetail(invId);
      if (invoiceData) {
        setPreviewInvoice(invoiceData);
      } else {
        showNotification('error', 'Gagal memuat data invoice pesanan.');
      }
    } catch (err: any) {
      console.error('Error previewing invoice from order:', err);
      showNotification('error', err.message || 'Gagal memproses invoice pesanan.');
    } finally {
      setLoadingInvoice(false);
    }
  }

  function openPaymentModal(order: any) {
    setPaymentOrder(order);
    setPaymentModalOpen(true);
    setDetailModalOpen(false);
  }

  function openReleaseModal(order: any) {
    setReleaseOrder(order);
    setReleaseModalOpen(true);
  }

  async function handlePaymentSubmit(payload: any) {
    await recordPayment(paymentOrder.id, payload);
    showNotification('success', 'Pembayaran order berhasil dicatat.');
  }

  async function handleReleaseDepositSubmit(payload: {
    orderId: string;
    kind: 'refund' | 'forfeit';
    amount: number;
    date: string;
    paymentMethod?: string | null;
    notes?: string | null;
  }) {
    await releaseDeposit(payload);
    showNotification(
      'success',
      payload.kind === 'refund'
        ? `Dana pelanggan sebesar ${formatIDR(payload.amount)} berhasil dikembalikan (refund).`
        : `DP pelanggan sebesar ${formatIDR(payload.amount)} berhasil ditandai sebagai pendapatan lain-lain (forfeit).`
    );
  }

  return (
    <AppShell
      title="Pesanan"
      subtitle="Pantau setiap pesanan dan status pembayarannya"
      actions={
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Pesanan Baru
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Notifikasi Toast / Banner */}
        {notification && (
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg p-4 text-xs font-medium shadow-sm border ${
              notification.type === 'success'
                ? 'bg-success-soft text-success border-success/20'
                : 'bg-destructive-soft text-destructive border-destructive/20'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {notification.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{notification.message}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {notification.action && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={notification.action.onClick}
                  className="gap-1.5 text-xs h-7 border-destructive/30 hover:bg-destructive/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {notification.action.label}
                </Button>
              )}
              <button
                onClick={() => setNotification(null)}
                className="p-1 rounded text-muted-foreground hover:bg-muted/50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <Card>
          <OrderFilters
            filters={filters}
            onFiltersChange={setFilters}
            counts={statusCounts}
            availablePoCodes={availablePoCodes}
          />
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : (
            <OrdersTable
              orders={filteredOrders}
              onView={openDetailModal}
              onEdit={openEditModal}
              onDelete={handlePromptDelete}
              onReleaseDeposit={openReleaseModal}
              onPreviewInvoice={handlePreviewInvoice}
            />
          )}
        </Card>
      </div>

      {/* Modal Buat / Edit Order */}
      <OrderModal
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setConvertingQuotation(null);
        }}
        onSubmit={handleFormSubmit}
        editingOrder={editingOrder}
        editingItems={editingItems}
        salesList={activeSales}
        productCategories={productCategories}
        prefillData={
          convertingQuotation
            ? {
                customer_name: convertingQuotation.customer_name,
                sales_id: convertingQuotation.sales_id || '',
                quotation_no: convertingQuotation.quotation_no,
                itemsSummary: (convertingQuotation.quotation_items || [])
                  .map((it: any) => `${it.product_name || it.item_name} (${it.qty} ${it.unit || 'pcs'})`)
                  .join(', '),
                notes: convertingQuotation.notes,
                quotationItems: convertingQuotation.quotation_items || [],
              }
            : null
        }
      />

      {/* Modal Detail Order */}
      <OrderDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        order={detailOrder}
        fetchOrderDetail={fetchOrderDetail}
        onAddPayment={openPaymentModal}
        onDeletePayment={deletePayment}
        onUpdateProductionStatus={updateProductionStatus}
        onPreviewInvoice={handlePreviewInvoice}
      />

      {/* Modal Pembayaran */}
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSubmit={handlePaymentSubmit}
        order={paymentOrder}
      />

      {/* Modal Kembalikan Uang / DP Hangus */}
      <OrderDepositReleaseModal
        isOpen={releaseModalOpen}
        onClose={() => {
          setReleaseModalOpen(false);
          setReleaseOrder(null);
        }}
        order={releaseOrder}
        onRelease={handleReleaseDepositSubmit}
      />

      {/* Modal Dialog Konfirmasi Hapus Order (Pengganti window.confirm) */}
      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive-soft text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Hapus Pesanan
                </h3>
                <p className="text-xs text-muted-foreground">
                  Apakah Anda yakin ingin menghapus pesanan <span className="font-semibold text-foreground">{deletingOrder.order_id}</span>?
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Tindakan ini akan membatalkan alokasi pergerakan stok otomatis terkait jika pesanan belum diproses. Pesanan yang masih memegang uang muka pelanggan tidak dapat dihapus sebelum dana diselesaikan.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingOrder(null)}
                disabled={isDeleting}
              >
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Pesanan'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Dialog Invoice Pesanan */}
      <PdfPreviewDialog
        open={Boolean(previewInvoice)}
        onClose={() => { setPreviewInvoice(null); setPdfBlobUrl(null); setSignatureMode('none'); setKeterangan(''); }}
        title={`Invoice — ${previewInvoice?.invoice_no ?? ''}`}
        subtitle={previewInvoice?.customer_name}
        pdfUrl={pdfBlobUrl}
        onDownload={handleDownloadInvoice}
        downloading={downloadingInvoice}
        signatureMode={signatureMode}
        onSignatureModeChange={setSignatureMode}
        hasSignature={Boolean(profile.signatureUrl)}
        hasStamp={Boolean(profile.stampUrl)}
        sideContent={
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Keterangan</label>
            <textarea
              rows={4}
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              placeholder="Tambahkan keterangan untuk invoice..."
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        }
      />
    </AppShell>
  );
}
