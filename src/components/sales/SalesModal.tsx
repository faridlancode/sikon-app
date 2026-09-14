import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/Button';

const EMPTY_FORM = { name: '', phone: '', is_active: true };

export default function SalesModal({ open, onClose, onSubmit, editingSales }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(
      editingSales
        ? { name: editingSales.name, phone: editingSales.phone || '', is_active: editingSales.is_active }
        : EMPTY_FORM
    );
    setError('');
  }, [open, editingSales]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) return setError('Nama sales wajib diisi.');

    setSubmitting(true);
    try {
      await onSubmit({ name: form.name.trim(), phone: form.phone.trim() || null, is_active: form.is_active });
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
          <h2 className="text-base font-semibold text-slate-900">{editingSales ? 'Edit Sales' : 'Tambah Sales'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Nama Sales</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Dina Marlina"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">No. HP (opsional)</span>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="08xxxxxxxxxx"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600/30"
            />
            <span className="text-sm text-slate-700">Aktif (muncul di pilihan sales saat buat order)</span>
          </label>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : editingSales ? 'Simpan Perubahan' : 'Tambah Sales'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
