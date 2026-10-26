import { useMemo } from 'react';
import { formatIDR } from '../utils/formatCurrency';
import { monthKey } from '../utils/dateHelpers';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Memeriksa apakah transaksi merupakan baris penyeimbang uang muka (Reversal Uang Muka).
 * Transaksi reversal bukan omzet/pemasukan bisnis riil, melainkan pembalikan administratif kasbon SPJ.
 */
export function isAdvanceReversal(trx: any): boolean {
  if (trx.type !== 'income') return false;
  const title = (trx.title || '').toLowerCase();
  if (title.startsWith('reversal uang muka')) return true;
  if (trx.purchasing_report_id && (trx.counter_account_id || title.includes('reversal'))) return true;
  return false;
}

/**
 * Custom hook untuk menghitung ringkasan finansial dari daftar transaksi:
 * - Total Pemasukan & Pengeluaran riil (kasbon SPJ yang sudah selesai dinetralkan dari pembengkakan)
 * - Selisih Kas Bersih
 * - Data tren bulanan bersih (untuk chart)
 * - Alokasi pengeluaran per kategori riil (untuk donut chart)
 */
export function useFinanceSummary(transactions: any[]) {
  return useMemo(() => {
    let grossIncome = 0;
    let grossExpense = 0;
    let reversalTotal = 0;

    const monthlyMap = new Map<string, { key: string; income: number; expense: number; reversal: number }>();
    const expenseByCategory = new Map<string, number>();

    for (const trx of transactions) {
      const amount = Number(trx.amount) || 0;
      const key = monthKey(trx.transaction_date);

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { key, income: 0, expense: 0, reversal: 0 });
      }
      const bucket = monthlyMap.get(key)!;

      if (trx.type === 'income') {
        grossIncome += amount;
        bucket.income += amount;

        if (isAdvanceReversal(trx)) {
          reversalTotal += amount;
          bucket.reversal += amount;
        }
      } else {
        grossExpense += amount;
        bucket.expense += amount;

        const categoryName = trx.transaction_categories?.name ?? trx.categories?.name ?? 'Tanpa Kategori';
        expenseByCategory.set(categoryName, (expenseByCategory.get(categoryName) ?? 0) + amount);
      }
    }

    // Pemasukan bersih: keluarkan pembalikan kasbon (reversal) agar tidak tampak seperti omzet masuk
    const totalIncome = Math.max(0, grossIncome - reversalTotal);

    // Pengeluaran bersih: kurangi kasbon yang sudah di-reversal oleh SPJ belanja riil
    const totalExpense = Math.max(0, grossExpense - reversalTotal);

    // Selisih kas bersih (sama persis dengan grossIncome - grossExpense)
    const netProfit = totalIncome - totalExpense;

    // Bersihkan juga alokasi 'Uang Muka Purchasing' pada donut chart sebesar reversal yang terjadi
    if (reversalTotal > 0 && expenseByCategory.has('Uang Muka Purchasing')) {
      const currentUangMuka = expenseByCategory.get('Uang Muka Purchasing') ?? 0;
      const netUangMuka = Math.max(0, currentUangMuka - reversalTotal);
      if (netUangMuka === 0) {
        expenseByCategory.delete('Uang Muka Purchasing');
      } else {
        expenseByCategory.set('Uang Muka Purchasing', netUangMuka);
      }
    }

    const trendData = Array.from(monthlyMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6) // 6 bulan terakhir agar chart tetap ringkas dan terbaca
      .map((item) => {
        const [, monthNum] = item.key.split('-');
        const cleanMonthIncome = Math.max(0, item.income - item.reversal);
        const cleanMonthExpense = Math.max(0, item.expense - item.reversal);
        return {
          name: MONTH_LABELS[Number(monthNum) - 1],
          Pemasukan: cleanMonthIncome,
          Pengeluaran: cleanMonthExpense,
        };
      });

    const categoryData = Array.from(expenseByCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      totalIncome,
      totalExpense,
      grossIncome,
      grossExpense,
      reversalTotal,
      netProfit,
      totalIncomeFormatted: formatIDR(totalIncome),
      totalExpenseFormatted: formatIDR(totalExpense),
      netProfitFormatted: formatIDR(netProfit),
      trendData,
      categoryData,
    };
  }, [transactions]);
}
