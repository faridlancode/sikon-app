import { useEffect, useState } from 'react';
import { X, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { todayISO } from '../../utils/dateHelpers';

const EMPTY_FORM = {
  type: 'expense',
  title: '',
  amount: '',
  transaction_date: todayISO(),
  category_id: '',
  description: '',
};

export default function TransactionModal({
  open,
  onClose,
  onSubmit,
  incomeCategories,
  expenseCategories,
  editingTransaction,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingTransaction) {
      setForm({
        type: editingTransaction.type,
        title: editingTransaction.title,
        amount: String(editingTransaction.amount),
        transaction_date: editingTransaction.transaction_date,
        category_id: editingTransaction.category_id ?? '',
        description: editingTransaction.description ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [open, editingTransaction]);

  if (!open) return null;

  const categoryOptions = form.type === 'income' ? incomeCategories : expenseCategories;

  function handleTypeChange(type) {
    setForm((f) => ({ ...f, type, category_id: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const amountNumber = Number(form.amount);
    if (!form.title.trim()) return setError('Judul transaksi wajib diisi.');
    if (!amountNumber || amountNumber <= 0) return setError('Jumlah harus berupa angka lebih dari 0.');
    if (!form.transaction_date) return setError('Tanggal wajib diisi.');

    setSubmitting(true);
    try {
      await onSubmit({
        type: form.type,
        title: form.title.trim(),
        amount: amountNumber,
        transaction_date: form.transaction_date,
        category_id: form.category_id || null,
        description: form.description.trim() || null,
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan transaksi. Coba lagi.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {editingTransaction ? 'Edit Transaksi' : 'Tambah Transaksi'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-5">
          {/* Toggle jenis transaksi */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                }`}
            >
              <ArrowUpCircle className="h-4 w-4" /> Pemasukan
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'
                }`}
            >
              <ArrowDownCircle className="h-4 w-4" /> Pengeluaran
            </button>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Jumlah (Rp)</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Judul Transaksi</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={form.type === 'income' ? 'mis. Pembayaran invoice #102' : 'mis. Sewa kantor bulan ini'}
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tanggal</span>
              <input
                type="date"
                value={form.transaction_date}
                onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Kategori</span>
              <select
                value={form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">Pilih kategori</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Catatan (opsional)</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Tambahkan detail tambahan bila perlu"
              className={inputClass}
            />
          </label>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : editingTransaction ? 'Simpan Perubahan' : 'Tambah Transaksi'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
