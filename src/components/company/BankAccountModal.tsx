import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import type { BankAccount } from '../../types';

type BankAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: Omit<BankAccount, 'id'>) => Promise<unknown>;
  editingAccount: BankAccount | null;
};

const EMPTY_FORM = { bank_name: '', account_number: '', account_holder_name: '', is_primary: false };

export default function BankAccountModal({ open, onClose, onSubmit, editingAccount }: BankAccountModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(
      editingAccount
        ? {
            bank_name: editingAccount.bank_name,
            account_number: editingAccount.account_number,
            account_holder_name: editingAccount.account_holder_name,
            is_primary: editingAccount.is_primary,
          }
        : EMPTY_FORM
    );
    setError('');
  }, [open, editingAccount]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.bank_name.trim()) return setError('Nama bank wajib diisi.');
    if (!form.account_number.trim()) return setError('Nomor rekening wajib diisi.');
    if (!form.account_holder_name.trim()) return setError('Nama pemilik rekening wajib diisi.');

    setSubmitting(true);
    try {
      await onSubmit({
        bank_name: form.bank_name.trim(),
        account_number: form.account_number.trim(),
        account_holder_name: form.account_holder_name.trim(),
        is_primary: form.is_primary,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {editingAccount ? 'Edit Rekening' : 'Tambah Rekening'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Nama Bank</span>
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
              placeholder="mis. BCA, Mandiri, BRI"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Nomor Rekening</span>
            <input
              type="text"
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
              placeholder="1234567890"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Nama Pemilik Rekening</span>
            <input
              type="text"
              value={form.account_holder_name}
              onChange={(e) => setForm((f) => ({ ...f, account_holder_name: e.target.value }))}
              placeholder="Sesuai buku rekening"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
            />
            <span className="text-sm text-foreground">Jadikan rekening utama</span>
          </label>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan...' : editingAccount ? 'Simpan Perubahan' : 'Tambah Rekening'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
