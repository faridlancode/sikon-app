import React, { useState } from 'react';
import { X, Unlock, AlertTriangle, AlertCircle } from 'lucide-react';
import { PoBatch } from '../../types';
import { getPoLabel } from './poHelpers';

interface ReopenPoModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch?: PoBatch | null;
  onConfirm: (params: { batchId: string; reason: string }) => Promise<{ success: boolean; error?: string }>;
}

export const ReopenPoModal: React.FC<ReopenPoModalProps> = ({
  isOpen,
  onClose,
  batch,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage('Alasan pembukaan kembali PO wajib diisi.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const res = await onConfirm({
      batchId: batch.id,
      reason: reason.trim(),
    });

    setSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.error || 'Gagal membuka kembali Batch PO');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-xl text-card-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-lg">
            <Unlock className="h-5 w-5" />
            <span>Buka Kembali Batch PO</span>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-semibold">{batch.code} — <span className="text-primary">{getPoLabel(batch)}</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">Status saat ini: Tertutup (Closed)</p>
        </div>

        {/* Warning syarat ketat */}
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Syarat Ketat Pembukaan Kembali PO</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Pembukaan kembali akan <strong>ditolak secara otomatis</strong> jika salah satu order dalam PO ini sudah memiliki tugas potong aktif/selesai, atau sudah memiliki pengajuan belanja bahan yang sedang diproses.
          </p>
          <p className="text-[11px] leading-relaxed">
            Snapshot laporan sebelumnya akan diarsipkan ke audit log, dan PO dapat menerima order baru atau koreksi item kembali.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Alasan Pembukaan Kembali <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Jelaskan secara spesifik alasan pembukaan kembali PO ini..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted text-foreground transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white shadow transition-colors disabled:opacity-50"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>{submitting ? 'Membuka...' : 'Buka Kembali PO'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
