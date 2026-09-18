import { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';

interface RejectReasonModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  reportTitle?: string;
}

export default function RejectReasonModal({
  open,
  onClose,
  onSubmit,
  reportTitle,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError('');
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      return setError('Alasan penolakan wajib diisi agar staf purchasing mengetahui perbaikannya.');
    }

    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menolak laporan.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-base font-semibold text-slate-900">Tolak Laporan SPJ</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {reportTitle && (
            <p className="text-xs text-muted-foreground">
              Menolak: <span className="font-medium text-slate-800">{reportTitle}</span>
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Alasan Penolakan</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="mis. Bukti nota tidak terbaca / harga tidak sesuai konfirmasi / foto nota salah"
              className={inputClass}
            />
          </label>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
            >
              {submitting ? 'Memproses...' : 'Tolak SPJ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
