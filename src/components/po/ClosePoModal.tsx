import React, { useState, useEffect } from 'react';
import { X, Lock, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { PoBatch } from '../../types';
import { getPoLabel, formatPoDateRange } from './poHelpers';
import { todayISO } from '../../utils/dateHelpers';

interface ClosePoModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch?: PoBatch | null;
  orderCount: number;
  totalQty: number;
  totalPrice: number;
  onConfirm: (params: {
    batchId: string;
    earlyReason?: string;
    markRekap?: boolean;
    note?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const ClosePoModal: React.FC<ClosePoModalProps> = ({
  isOpen,
  onClose,
  batch,
  orderCount,
  totalQty,
  totalPrice,
  onConfirm,
}) => {
  const [earlyReason, setEarlyReason] = useState('');
  const [markRekap, setMarkRekap] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bandingkan tanggal hari ini WIB dengan end_date PO
  const todayStr = todayISO();
  const isEarlyClose = Boolean(batch && todayStr < batch.end_date);

  useEffect(() => {
    if (isOpen && batch) {
      setEarlyReason('');
      setMarkRekap(false);
      setNote('');
      setErrorMessage(null);
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEarlyClose && !earlyReason.trim()) {
      setErrorMessage(`Alasan penutupan lebih awal wajib diisi karena PO belum melewati tanggal selesai (${batch.end_date}).`);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const res = await onConfirm({
      batchId: batch.id,
      earlyReason: earlyReason.trim() || undefined,
      markRekap,
      note: note.trim() || undefined,
    });

    setSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.error || 'Gagal menutup Batch PO');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl bg-card border border-border p-6 shadow-xl text-card-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <Lock className="h-5 w-5" />
            <span>Tutup Batch Pre-Order</span>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* PO Info */}
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm space-y-1">
          <div className="flex justify-between font-semibold">
            <span>{batch.code}</span>
            <span className="text-primary">{getPoLabel(batch)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Periode: {formatPoDateRange(batch.start_date, batch.end_date)}
          </p>
          <div className="pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-muted-foreground">Total Pesanan</p>
              <p className="font-bold text-foreground">{orderCount} order</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Qty</p>
              <p className="font-bold text-foreground">{totalQty} pcs</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Nilai</p>
              <p className="font-bold text-primary">Rp {totalPrice.toLocaleString('id-ID')}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Early Close Notice */}
          {isEarlyClose && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Penutupan Lebih Awal</span>
              </div>
              <p className="mt-1">
                PO ini belum mencapai batas tanggal selesai ({batch.end_date}). Karena Anda menutup PO ini lebih awal,
                Anda <strong>wajib</strong> mengisi alasan penutupan di bawah ini.
              </p>
              <div className="mt-2">
                <label className="block text-xs font-medium text-amber-950 dark:text-amber-100">
                  Alasan Penutupan Lebih Awal <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kuota produksi sudah penuh / permintaan libur awal"
                  value={earlyReason}
                  onChange={(e) => setEarlyReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-amber-400 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Option: Mark Rekap All Orders */}
          <div
            onClick={() => setMarkRekap(!markRekap)}
            className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <div className="mt-0.5 text-primary">
              {markRekap ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </div>
            <div className="text-xs">
              <p className="font-semibold text-foreground">
                Tandai tahap Rekap selesai untuk semua order
              </p>
              <p className="text-muted-foreground mt-0.5">
                Secara otomatis menandai tahap timeline &apos;rekap&apos; sebagai selesai pada seluruh {orderCount} order di PO ini.
              </p>
            </div>
          </div>

          {/* Close Note */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Catatan Penutupan (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Tambahkan catatan khusus untuk laporan rekap PO ini..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Peringatan Dampak */}
          <p className="text-[11px] text-muted-foreground leading-normal">
            Setelah ditutup, rincian produk, kuantitas, dan harga order pada PO ini akan dikunci. Laporan close akan dibekukan (snapshot).
          </p>

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
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
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow transition-colors disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>{submitting ? 'Menutup PO...' : 'Konfirmasi Tutup PO'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
