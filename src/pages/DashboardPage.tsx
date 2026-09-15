import AppShell from '../components/layout/AppShell';
import OverviewCards from '../components/overview/OverviewCards';
import OrderTrendChart from '../components/overview/OrderTrendChart';
import OrderStatusChart from '../components/overview/OrderStatusChart';
import SalesPerformanceCard from '../components/overview/SalesPerformanceCard';
import RecentOrdersCard from '../components/overview/RecentOrdersCard';
import CategoryQuantityCard from '../components/overview/CategoryQuantityCard';
import { useOrders } from '../hooks/useOrders';
import { useOrderSummary } from '../hooks/useOrderSummary';
import { useSalesPerformance } from '../hooks/useSalesPerformance';

export default function DashboardPage() {
  const { orders, loading } = useOrders();
  const summary = useOrderSummary(orders);
  const { performance } = useSalesPerformance();
  const qtyBySales = performance.reduce((totals, sales) => {
    totals[sales.sales_id] = orders
      .filter((order) => order.sales_id === sales.sales_id)
      .reduce((sum, order) => sum + Number(order.total_qty || 0), 0);
    return totals;
  }, {});

  if (loading) {
    return (
      <AppShell title="Ikhtisar Dashboard" subtitle="Ringkasan operasional, tren omzet, dan performa penjualan">
        <div className="flex justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ikhtisar Dashboard" subtitle="Ringkasan operasional, tren omzet, dan performa penjualan">
      <OverviewCards summary={summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <OrderTrendChart data={summary.trendData} />
        <OrderStatusChart data={summary.statusData} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SalesPerformanceCard performance={performance} qtyBySales={qtyBySales} />
        <CategoryQuantityCard categories={summary.categoryData} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <RecentOrdersCard orders={summary.recentOrders} />
      </div>
    </AppShell>
  );
}
