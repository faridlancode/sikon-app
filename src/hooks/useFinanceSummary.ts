import { useMemo } from 'react';
import { formatIDR } from '../utils/formatCurrency';
import { monthKey } from '../utils/dateHelpers';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Custom hook untuk menghitung ringkasan finansial dari daftar transaksi:
 * - Total Pemasukan & Pengeluaran
 * - Laba Bersih
 * - Data tren bulanan (untuk chart)
 * - Alokasi pengeluaran per kategori (untuk donut chart)
 */
export function useFinanceSummary(transactions) {
  return useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const monthlyMap = new Map();
    const expenseByCategory = new Map();

    for (const trx of transactions) {
      const amount = Number(trx.amount) || 0;
      const key = monthKey(trx.transaction_date);

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { key, income: 0, expense: 0 });
      }
      const bucket = monthlyMap.get(key);

      if (trx.type === 'income') {
        totalIncome += amount;
        bucket.income += amount;
      } else {
        totalExpense += amount;
        bucket.expense += amount;
        const categoryName = trx.transaction_categories?.name ?? trx.categories?.name ?? 'Tanpa Kategori';
        expenseByCategory.set(categoryName, (expenseByCategory.get(categoryName) ?? 0) + amount);
      }
    }

    const netProfit = totalIncome - totalExpense;

    const trendData = Array.from(monthlyMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6) // 6 bulan terakhir agar chart tetap ringkas dan terbaca
      .map((item) => {
        const [, monthNum] = item.key.split('-');
        return {
          name: MONTH_LABELS[Number(monthNum) - 1],
          Pemasukan: item.income,
          Pengeluaran: item.expense,
        };
      });

    const categoryData = Array.from(expenseByCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalIncome,
      totalExpense,
      netProfit,
      totalIncomeFormatted: formatIDR(totalIncome),
      totalExpenseFormatted: formatIDR(totalExpense),
      netProfitFormatted: formatIDR(netProfit),
      trendData,
      categoryData,
    };
  }, [transactions]);
}
