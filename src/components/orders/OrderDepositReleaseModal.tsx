import React, { useState, useEffect } from 'react';
import { X, RotateCcw, AlertCircle, Calendar, CreditCard, DollarSign } from 'lucide-react';
import Button from '../ui/button';
import { formatIDR, parseIDRInput } from '../../utils/formatCurrency';
import { todayISO } from '../../utils/dateHelpers';

interface OrderDepositReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onRelease: (payload: {
    orderId: string;
    kind: 'refund' | 'forfeit';
    amount: number;
    date: string;
    paymentMethod?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}

export default function OrderDepositReleaseModal({
  isOpen,
  onClose,
  order,
  onRelease,
}: OrderDepositReleaseModalProps) {
  const today = todayISO();

  const [kind, setKind] = useState<'refund' | 'forfeit'>('refund');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(today);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Inisialisasi nominal default dari paid_amount saat modal dibuka
  useEffect(() => {
    if (order && isOpen) {
      const maxAvailable = Number(order.paid_amount) || 0;
      setAmount(maxAvailable);
      setDate(todayISO());
      setNotes(
        kind === 'refund'
          ? `Pengembalian dana (refund) untuk order ${order.order_id}`
          : `DP hangus untuk order ${order.order_id}`
      );
      setError(null);
    }
  }, [order, isOpen, kind]);

  if (!isOpen || !order) return null;

  const currentPaid = Number(order.paid_amount) || 0;
  const remainingAfter = Math.max(0, currentPaid - amount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) {
      setError('Nominal harus lebih dari 0.');
      return;
    }
    if (amount > currentPaid) {
      setError(`Nominal tidak boleh melebihi dana pelanggan yang dipegang (${formatIDR(currentPaid)}).`);
      return;
    }
    if (!date) {
      setError('Tanggal pelepasan wajib diisi.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onRelease({
        orderId: order.id,
        kind,
        amount,
        date,
        paymentMethod: kind === 'refund' ? paymentMethod : null,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal melepaskan deposit order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Kembalikan Uang / DP Hangus
              </h2>
              <p className="text-xs text-muted-foreground">
                Pelepasan uang muka pelanggan untuk order <span className="font-semibold">{order.order_id}</span> ({order.customer_name})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Info Saldo Pelanggan */}
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Dana Dipegang:</span>
              <span className="font-semibold text-foreground font-mono">{formatIDR(currentPaid)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Nominal Pelepasan:</span>
              <span className="font-semibold text-primary font-mono">{formatIDR(amount)}</span>
            </div>
            <div className="border-t border-border pt-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">Sisa Dana Dipegang Setelahnya:</span>
              <span className={`font-semibold font-mono ${remainingAfter > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatIDR(remainingAfter)}
              </span>
            </div>
          </div>

          {/* Pilihan Jenis */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Jenis Pelepasan <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('refund')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition ${
                  kind === 'refund'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <DollarSign className="h-4 w-4" />
                Kembalikan Uang (Refund)
              </button>
              <button
                type="button"
                onClick={() => setKind('forfeit')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition ${
                  kind === 'forfeit'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 font-semibold'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <RotateCcw className="h-4 w-4" />
                DP Hangus (Forfeit)
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {kind === 'refund'
                ? 'Uang pelanggan dikembalikan ke kas/rekening bank perusahaan (mencatat transaksi pengeluaran).'
                : 'Uang muka pelanggan dianggap hangus dan diakui sebagai Pendapatan Lain-lain (4-9000).'}
            </p>
          </div>

          {/* Nominal */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-foreground">
                Nominal Pelepasan (Rp) <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={() => setAmount(currentPaid)}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Pelepasan Penuh ({formatIDR(currentPaid)})
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              required
              value={amount ? new Intl.NumberFormat('id-ID').format(amount) : ''}
              placeholder="0"
              onChange={(e) => setAmount(parseIDRInput(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-right font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Tanggal */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Tanggal Transaksi <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Metode Pembayaran (hanya bila refund) */}
          {kind === 'refund' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Metode Pengembalian Kas/Bank <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs text-foreground cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                    className="text-primary"
                  />
                  <span>Kas Tunai</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs text-foreground cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={paymentMethod === 'transfer'}
                    onChange={() => setPaymentMethod('transfer')}
                    className="text-primary"
                  />
                  <span>Transfer Bank</span>
                </label>
              </div>
            </div>
          )}

          {/* Catatan / Alasan */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Catatan / Alasan
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pembatalan pesanan atas permintaan pelanggan"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={kind === 'refund' ? 'default' : 'secondary'}
              disabled={submitting}
            >
              {submitting ? 'Memproses...' : kind === 'refund' ? 'Kembalikan Uang' : 'Tandai DP Hangus'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
