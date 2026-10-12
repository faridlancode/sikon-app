import React, { useState, useEffect } from 'react';
import { AlertTriangle, DollarSign, Calendar, FileText, X } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import type { FixedAssetRegisterItem } from '../../types';

interface DisposeAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: FixedAssetRegisterItem | null;
  onConfirm: (payload: {
    assetId: string;
    date: string;
    proceeds?: number;
    paymentMethod?: string | null;
  }) => Promise<string>;
}

export default function DisposeAssetModal({
  isOpen,
  onClose,
  asset,
  onConfirm,
}: DisposeAssetModalProps) {
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceeds, setProceeds] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && asset) {
      setDisposalDate(new Date().toISOString().slice(0, 10));
      setProceeds(0);
      setPaymentMethod('cash');
      setNotes('');
      setError(null);
    }
  }, [isOpen, asset]);

  if (!isOpen || !asset) return null;

  const bookValue = asset.book_value;
  const gainOrLoss = proceeds - bookValue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposalDate) {
      setError('Tanggal pelepasan wajib diisi.');
      return;
    }
    if (disposalDate < asset.acquisition_date) {
      setError(`Tanggal pelepasan tidak boleh lebih awal dari tanggal perolehan (${asset.acquisition_date}).`);
      return;
    }
    if (proceeds < 0) {
      setError('Nilai hasil penjualan tidak boleh bernilai negatif.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onConfirm({
        assetId: asset.id,
        date: disposalDate,
        proceeds: proceeds > 0 ? proceeds : 0,
        paymentMethod: proceeds > 0 ? paymentMethod : null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Gagal melepaskan aset tetap.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg overflow-hidden shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Pelepasan / Penjualan Aset</h3>
              <p className="text-xs text-muted-foreground">{asset.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Asset Summary Info */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 text-xs">
            <div>
              <span className="text-muted-foreground block">Harga Perolehan:</span>
              <span className="font-medium text-foreground">{formatIDR(asset.cost)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Akumulasi Penyusutan:</span>
              <span className="font-medium text-foreground">{formatIDR(asset.accumulated)}</span>
            </div>
            <div className="col-span-2 pt-1 border-t border-border/40 flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Nilai Buku Saat Ini:</span>
              <span className="font-bold text-foreground text-sm">{formatIDR(bookValue)}</span>
            </div>
          </div>

          {/* Disposal Date */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Tanggal Pelepasan / Penjualan *
            </label>
            <input
              type="date"
              value={disposalDate}
              onChange={(e) => setDisposalDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Proceeds */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              Hasil Penjualan / Nilai Pelepasan (Rp)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={proceeds === 0 ? '' : proceeds}
              onChange={(e) => setProceeds(Number(e.target.value) || 0)}
              placeholder="0 (jika dibuang/rusak tanpa hasil penjualan)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              Masukkan 0 bila aset dibuang, dihapusbukukan, atau rusak tanpa penerimaan kas.
            </p>
          </div>

          {/* Payment Method (if proceeds > 0) */}
          {proceeds > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Rekening / Kas Penerimaan Hasil Penjualan *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 rounded-lg border text-xs font-medium transition-all text-center ${
                    paymentMethod === 'cash'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  Kas Tunai (1-1001)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`p-2.5 rounded-lg border text-xs font-medium transition-all text-center ${
                    paymentMethod === 'transfer'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  Kas Bank (1-1002)
                </button>
              </div>
            </div>
          )}

          {/* Live Gain/Loss Calculation */}
          <div className="p-3 rounded-lg border border-border bg-card space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Hasil Pelepasan:</span>
              <span className="font-medium text-foreground">{formatIDR(proceeds)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Nilai Buku Aset:</span>
              <span className="font-medium text-foreground">{formatIDR(bookValue)}</span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground">Perkiraan Untung / (Rugi):</span>
              <span
                className={`text-sm font-bold ${
                  gainOrLoss > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : gainOrLoss < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-muted-foreground'
                }`}
              >
                {gainOrLoss > 0
                  ? `+${formatIDR(gainOrLoss)} (Laba Pelepasan)`
                  : gainOrLoss < 0
                  ? `-${formatIDR(Math.abs(gainOrLoss))} (Rugi Pelepasan)`
                  : 'Rp 0 (Impas)'}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              Alasan / Keterangan Pelepasan
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Dijual ke bengkel mitra, rusak total akibat banjir, dll."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {loading ? 'Memproses...' : 'Konfirmasi Pelepasan Aset'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
