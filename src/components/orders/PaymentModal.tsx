import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { formatIDR, formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';
import { todayISO } from '../../utils/dateHelpers';

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'cash', label: 'Tunai' },
  { value: 'qris', label: 'QRIS' },
  { value: 'lainnya', label: 'Lainnya' },
];

export default function PaymentModal({ open, onClose, onSubmit, order }) {
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('dp');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setAmount('');
      setPaymentType('dp');
      setPaymentDate(todayISO());
      setPaymentMethod('transfer');
      setError('');
    }
  }, [open]);

  if (!open || !order) return null;

  const remaining = Number(order.remaining_amount) || 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const amountNumber = parseIDRInput(amount);
    if (!amountNumber || amountNumber <= 0) return setError('Jumlah harus lebih dari 0.');
    if (amountNumber > remaining) {
      return setError(`Jumlah melebihi sisa tagihan (${formatIDR(remaining)}).`);
    }

    setSubmitting(true);
    try {
      await onSubmit({ amount: amountNumber, paymentType, paymentDate, paymentMethod });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pembayaran. Coba lagi.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Catat Pembayaran</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span>Order</span>
              <span className="font-medium text-slate-900">{order.order_id}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-slate-500">
              <span>Sisa Tagihan</span>
              <span className="font-semibold tabular-nums text-amber-700">{formatIDR(remaining)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPaymentType('dp')}
              className={`rounded-md py-2 text-sm font-medium transition-colors ${paymentType === 'dp' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
                }`}
            >
              DP
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('pelunasan')}
              className={`rounded-md py-2 text-sm font-medium transition-colors ${paymentType === 'pelunasan' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
                }`}
            >
              Pelunasan
            </button>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Jumlah Dibayar (Rp)</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatIDRInput(e.target.value))}
              placeholder="0"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setAmount(formatIDRInput(remaining))}
              className="mt-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Isi penuh ({formatIDR(remaining)})
            </button>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tanggal</span>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Metode</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <p className="text-xs text-slate-400">
            Pembayaran ini akan otomatis tercatat sebagai pemasukan di halaman Financial.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Catat Pembayaran'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
