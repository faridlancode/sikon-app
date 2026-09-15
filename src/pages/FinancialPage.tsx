import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import SummaryCards from '../components/dashboard/SummaryCards';
import TrendChart from '../components/dashboard/TrendChart';
import CategoryDonutChart from '../components/dashboard/CategoryDonutChart';
import EditBalanceModal from '../components/dashboard/EditBalanceModal';
import TransactionFilters from '../components/transactions/TransactionFilters';
import TransactionTable from '../components/transactions/TransactionTable';
import TransactionModal from '../components/transactions/TransactionModal';
import Card from '../components/ui/card';
import Button from '../components/ui/button';
import { useTransactions } from '../hooks/useTransactions';
import { useCategories } from '../hooks/useCategories';
import { useFinanceSummary } from '../hooks/useFinanceSummary';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useOrders } from '../hooks/useOrders';

const DEFAULT_FILTERS = { type: 'all', startDate: '', endDate: '', search: '' };

export default function FinancialPage() {
  const { transactions, loading, addTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { incomeCategories, expenseCategories } = useCategories();
  const { saldoAwal, updateSaldoAwal } = useCompanySettings();
  const { orders } = useOrders();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);

  const summary = useFinanceSummary(transactions);
  const bankBalance = saldoAwal + summary.totalIncome - summary.totalExpense;

  // Piutang: total sisa tagihan dari seluruh order berstatus "belum_lunas"
  const piutang = useMemo(
    () => orders.filter((o) => o.status === 'belum_lunas').reduce((sum, o) => sum + Number(o.remaining_amount || 0), 0),
    [orders]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((trx) => {
      if (filters.type !== 'all' && trx.type !== filters.type) return false;
      if (filters.startDate && trx.transaction_date < filters.startDate) return false;
      if (filters.endDate && trx.transaction_date > filters.endDate) return false;
      if (filters.search && !trx.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, filters]);

  const typeCounts = useMemo(
    () => ({
      all: transactions.length,
      income: transactions.filter((t) => t.type === 'income').length,
      expense: transactions.filter((t) => t.type === 'expense').length,
    }),
    [transactions]
  );

  function openAddModal() {
    setEditingTransaction(null);
    setModalOpen(true);
  }

  function openEditModal(trx) {
    setEditingTransaction(trx);
    setModalOpen(true);
  }

  async function handleModalSubmit(payload) {
    if (editingTransaction) {
      await updateTransaction(editingTransaction.id, payload);
    } else {
      await addTransaction(payload);
    }
  }

  return (
    <AppShell
      title="Keuangan"
      subtitle="Pantau arus kas dan performa keuangan perusahaan"
      actions={
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah Transaksi
        </Button>
      }
    >
      <SummaryCards
        summary={summary}
        bankBalance={bankBalance}
        saldoAwal={saldoAwal}
        piutang={piutang}
        onEditSaldoAwal={() => setBalanceModalOpen(true)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <TrendChart data={summary.trendData} />
        <CategoryDonutChart data={summary.categoryData} />
      </div>

      <Card>
        <TransactionFilters filters={filters} onFiltersChange={setFilters} counts={typeCounts} />
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <TransactionTable transactions={filteredTransactions} onEdit={openEditModal} onDelete={deleteTransaction} />
        )}
      </Card>

      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
        editingTransaction={editingTransaction}
      />

      <EditBalanceModal
        open={balanceModalOpen}
        onClose={() => setBalanceModalOpen(false)}
        currentValue={saldoAwal}
        onSubmit={updateSaldoAwal}
      />
    </AppShell>
  );
}
