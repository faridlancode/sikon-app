import React, { useMemo, useState } from 'react';
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
import { formatIDR } from '../utils/formatCurrency';

const DEFAULT_FILTERS = {
  status: 'all',
  search: '',
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

  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [editingItems, setEditingItems] = useState<any[]>([]);

  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [paymentOrder, setPaymentOrder] = useState<any | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

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

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.status !== 'all' && order.status !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${order.order_id} ${order.customer_name} ${order.sales_name ?? ''}`.toLowerCase();
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
    setEditingOrder(null);
    setEditingItems([]);
    setFormModalOpen(true);
  }

  async function openEditModal(order: any) {
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
      showNotification('success', `Order ${newOrder.order_id} berhasil dibuat.`);
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
          <OrderFilters filters={filters} onFiltersChange={setFilters} counts={statusCounts} />
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
            />
          )}
        </Card>
      </div>

      {/* Modal Buat / Edit Order */}
      <OrderModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        editingOrder={editingOrder}
        editingItems={editingItems}
        salesList={activeSales}
        productCategories={productCategories}
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
    </AppShell>
  );
}
