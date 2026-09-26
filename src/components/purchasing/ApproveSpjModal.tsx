import { useState, useMemo, useEffect } from 'react';
import {
  X,
  Wallet,
  User,
  ShoppingBag,
  Info,
  AlertCircle,
  Package,
} from 'lucide-react';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';
import { formatIDR, formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';
import type { StockRequest, Staff } from '../../types';

interface ApproveSpjModalProps {
  open: boolean;
  onClose: () => void;
  requests: StockRequest[];
  purchasingStaff: Staff[];
  onSubmit: (payload: {
    requestIds: string[];
    purchasingStaffId: string;
    advanceAmount: number;
    notes?: string;
  }) => Promise<void>;
}

export default function ApproveSpjModal({
  open,
  onClose,
  requests,
  purchasingStaff,
  onSubmit,
}: ApproveSpjModalProps) {
  const [purchasingStaffId, setPurchasingStaffId] = useState('');
  const [advanceAmountInput, setAdvanceAmountInput] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize defaults when modal opens
  useEffect(() => {
    if (open) {
      if (purchasingStaff.length > 0 && !purchasingStaffId) {
        setPurchasingStaffId(purchasingStaff[0].id);
      }
      setAdvanceAmountInput('');
      setNotes(
        requests.length === 1
          ? `Uang muka belanja ${requests[0].materials?.name || 'material'}`
          : `Uang muka belanja ${requests.length} item material pengajuan gudang`
      );
      setError(null);
    }
  }, [open, purchasingStaff, requests]);

  const totalItems = requests.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchasingStaffId) {
      setError('Pilih staf purchasing yang akan bertugas belanja.');
      return;
    }

    const advanceAmount = parseIDRInput(advanceAmountInput);
    if (advanceAmount < 0) {
      setError('Nominal uang muka tidak valid.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit({
        requestIds: requests.map((r) => r.id),
        purchasingStaffId,
        advanceAmount,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Gagal mencairkan uang muka SPJ:', err);
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses approval SPJ.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Buat SPJ — Cairkan Uang Muka
              </h2>
              <p className="text-xs text-muted-foreground">
                Approve pengajuan restock via jalur SPJ Belanja Ritel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Request items preview */}
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-primary" />
                Material yang Diajukan ({totalItems} item)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Jalur: <span className="font-semibold text-amber-600">SPJ Belanja</span>
              </span>
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-border/60 text-xs">
              {requests.map((req) => (
                <div key={req.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {req.materials?.name || 'Material'}
                    </p>
                    {req.material_colors && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span
                          className="h-2 w-2 rounded-full border border-slate-300"
                          style={{
                            backgroundColor: req.material_colors.color_code || '#94a3b8',
                          }}
                        />
                        {req.material_colors.color_name}
                      </span>
                    )}
                    {req.reason && (
                      <p className="text-[10px] text-muted-foreground italic truncate">
                        "{req.reason}"
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-semibold text-foreground">
                      {req.quantity_needed} {req.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Staf Purchasing Selector */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Staf Purchasing yang Ditugaskan <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={purchasingStaffId}
                onChange={(e) => setPurchasingStaffId(e.target.value)}
                className={`${inputClass} appearance-none pr-8`}
                required
              >
                <option value="">-- Pilih Staf Purchasing --</option>
                {purchasingStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role || 'Purchasing'})
                  </option>
                ))}
              </select>
              <User className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            {purchasingStaff.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">
                Belum ada staf dengan role "Purchasing" yang aktif.
              </p>
            )}
          </div>

          {/* Nominal Uang Muka (Kasbon) */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Nominal Uang Muka (Kasbon)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                Rp
              </span>
              <input
                type="text"
                value={advanceAmountInput}
                onChange={(e) => setAdvanceAmountInput(formatIDRInput(e.target.value))}
                placeholder="0 (atau kosong jika tanpa uang muka)"
                className={`${inputClass} pl-9 font-semibold text-foreground`}
              />
            </div>
            {/* Quick amount chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[200000, 500000, 1000000, 2000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAdvanceAmountInput(formatIDRInput(String(amt)))}
                  className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  +{formatIDR(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* Catatan / Keperluan */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Catatan / Keperluan Belanja
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Belanja kancing & furing pasar Baru..."
              className={inputClass}
            />
          </div>

          {/* Informational note */}
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-accent/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Alur Selanjutnya:</p>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                <li>Uang muka akan dicatat sebagai pengeluaran kasbon staf.</li>
                <li>SPJ berstatus <strong>Sedang Belanja</strong> (<code className="text-[10px]">disbursed</code>).</li>
                <li>Staf purchasing akan mengisi rincian & upload foto nota setelah belanja selesai.</li>
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
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
              disabled={loading || !purchasingStaffId}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              <Wallet className="h-4 w-4" />
              {loading ? 'Memproses...' : 'Cairkan & Setujui SPJ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
