import { useMemo } from "react";
import { monthKey } from "../utils/dateHelpers";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Ags",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/**
 * Menghitung ringkasan & tren dari daftar order (view orders_with_balance):
 * - Total Order, Total Revenue, Total Terbayar, Sisa Tagihan, Rata-rata Nilai Order
 * - Tren jumlah & nilai order per bulan (6 bulan terakhir)
 * - Breakdown status (Lunas vs Belum Lunas)
 */
export function useOrderSummary(orders) {
  return useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce(
      (sum, o) => sum + Number(o.grand_total || 0),
      0,
    );
    const totalPaid = orders.reduce(
      (sum, o) => sum + Number(o.paid_amount || 0),
      0,
    );
    const totalOutstanding = orders
      .filter((o) => o.status === "belum_lunas")
      .reduce((sum, o) => sum + Number(o.remaining_amount || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalQty = orders.reduce(
      (sum, order) => sum + Number(order.total_qty || 0),
      0,
    );
    const categoryQty = orders.reduce((totals, order) => {
      Object.entries(order.category_qty || {}).forEach(([category, qty]) => {
        totals[category] = (totals[category] || 0) + Number(qty || 0);
      });
      return totals;
    }, {});
    const categoryData = Object.entries(categoryQty)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => Number(b.qty) - Number(a.qty));

    const lunasCount = orders.filter((o) => o.status === "lunas").length;
    const belumLunasCount = totalOrders - lunasCount;

    const statusData = [
      { name: "Lunas", value: lunasCount },
      { name: "Belum Lunas", value: belumLunasCount },
    ];

    const monthlyMap = new Map();
    for (const order of orders) {
      const key = monthKey(order.order_date);
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { key, count: 0, value: 0 });
      }
      const bucket = monthlyMap.get(key);
      bucket.count += 1;
      bucket.value += Number(order.grand_total || 0);
    }

    const trendData = Array.from(monthlyMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6)
      .map((item) => {
        const [, monthNum] = item.key.split("-");
        return {
          name: MONTH_LABELS[Number(monthNum) - 1],
          "Jumlah Order": item.count,
          "Nilai Order": item.value,
        };
      });

    // Order terbaru untuk ditampilkan di daftar ringkas Dashboard
    const recentOrders = [...orders]
      .sort(
        (a, b) =>
          new Date(b.order_date).getTime() - new Date(a.order_date).getTime(),
      )
      .slice(0, 5);

    return {
      totalOrders,
      totalRevenue,
      totalPaid,
      totalOutstanding,
      avgOrderValue,
      totalQty,
      categoryData,
      statusData,
      trendData,
      recentOrders,
    };
  }, [orders]);
}
