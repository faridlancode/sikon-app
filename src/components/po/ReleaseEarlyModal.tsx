import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';
import { supabase } from '../../lib/supabaseClient';

interface ReleaseEarlyModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderCode?: string;
  poName?: string;
  onSuccess: () => void;
}

export const ReleaseEarlyModal: React.FC<ReleaseEarlyModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderCode,
  poName,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Alasan lepas ke produksi lebih awal wajib diisi.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc('release_order_early', {
        p_order_id: orderId,
        p_reason: reason.trim(),
      });

      if (rpcError) {
        // Tampilkan pesan error server apa adanya
        setError(rpcError.message);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lepas ke Produksi Lebih Awal"
        className="relative flex w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        <div className="border-b border-border bg-amber-50/70 dark:bg-amber-950/20 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Lepas ke Produksi Lebih Awal</h3>
              <p className="text-xs text-muted-foreground">Bypass gerbang tutup PO dengan alasan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            title="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pesanan <span className="font-semibold text-foreground">{orderCode || orderId}</span>
            {poName && (
              <>
                {' '}pada Batch PO <span className="font-semibold text-foreground">{poName}</span>
              </>
            )}{' '}
            akan dilepas ke antrian produksi sekarang (stage Rekap ditandai selesai) sebelum Batch PO ditutup.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-foreground">
              Alasan Pelepasan <span className="text-rose-500">*</span>
            </span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Permintaan pelanggan mendesak karena jadwal event..."
              className={inputClass}
              autoFocus
            />
          </label>

          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Memproses...
                </>
              ) : (
                'Lepas ke Produksi'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReleaseEarlyModal;
