import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/card';
import Button from '../components/ui/button';
import OrderFilters from '../components/orders/OrderFilters';
import OrdersTable from '../components/orders/OrdersTable';
import OrderModal from '../components/orders/OrderModal';
import OrderDetailModal from '../components/orders/OrderDetailModal';
import PaymentModal from '../components/orders/PaymentModal';
import { useOrders } from '../hooks/useOrders';
import { useSales } from '../hooks/useSales';

const DEFAULT_FILTERS = { status: 'all', search: '' };

export default function OrdersPage() {
  const {
    orders,
    loading,
    createOrder,
    updateOrder,
    deleteOrder,
    fetchOrderDetail,
    recordPayment,
    deletePayment,
  } = useOrders();
  const { activeSales } = useSales();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);

  const [detailOrder, setDetailOrder] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

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

  async function openEditModal(order) {
    const { items } = await fetchOrderDetail(order.id);
    setEditingOrder(order);
    setEditingItems(items);
    setFormModalOpen(true);
  }

  async function handleFormSubmit(payload) {
    if (editingOrder) {
      await updateOrder(editingOrder.id, payload);
    } else {
      const newOrder = await createOrder(payload);
      await recordPayment(newOrder.id, payload.payment);
    }
  }

  async function handleDeleteOrder(order) {
    if (!window.confirm(`Hapus order ${order.order_id}? Seluruh item dan riwayat pembayarannya juga akan terhapus.`)) {
      return;
    }
    await deleteOrder(order.id);
  }

  function openDetailModal(order) {
    setDetailOrder(order);
    setDetailModalOpen(true);
  }

  function openPaymentModal(order) {
    setPaymentOrder(order);
    setPaymentModalOpen(true);
    setDetailModalOpen(false);
  }

  async function handlePaymentSubmit(payload) {
    await recordPayment(paymentOrder.id, payload);
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
            onDelete={handleDeleteOrder}
          />
        )}
      </Card>

      <OrderModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        editingOrder={editingOrder}
        editingItems={editingItems}
        salesList={activeSales}
      />

      <OrderDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        order={detailOrder}
        fetchOrderDetail={fetchOrderDetail}
        onAddPayment={openPaymentModal}
        onDeletePayment={deletePayment}
      />

      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSubmit={handlePaymentSubmit}
        order={paymentOrder}
      />
    </AppShell>
  );
}
