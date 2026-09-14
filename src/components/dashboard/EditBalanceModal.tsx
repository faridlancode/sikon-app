import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/Button';

export default function EditBalanceModal({ open, onClose, currentValue, onSubmit }) {
  const [value, setValue] = useState(String(currentValue ?? 0));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue(String(currentValue ?? 0));
      setError('');
    }
  }, [open, currentValue]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const number = Number(value);
    if (Number.isNaN(number) || number < 0) {
      setError('Masukkan angka yang valid.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(number);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.';
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
          <h2 className="text-base font-semibold text-slate-900">Atur Saldo Awal Kas/Bank</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <p className="text-sm text-slate-500">
            Saldo yang sudah ada di rekening perusahaan sebelum mulai memakai SIKon. "Total Uang di Bank" akan
            dihitung sebagai saldo awal ditambah seluruh pemasukan, dikurangi seluruh pengeluaran.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Saldo Awal (Rp)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
            />
          </label>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
