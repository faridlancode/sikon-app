import { useState, useEffect } from "react";
import { X, SlidersHorizontal, AlertTriangle, CheckCircle2 } from "lucide-react";
import Button from "../ui/button";
import { inputClass } from "../ui/FormField";
import { formatIDR } from "../../utils/formatCurrency";

interface StockAdjustmentTarget {
  materialId: string;
  materialName: string;
  materialColorId: string | null;
  colorName: string | null;
  unit: string;
  currentStock: number;
  minimumStock: number;
  categoryName?: string;
  isFabric?: boolean;
}

interface StockAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  target: StockAdjustmentTarget | null;
  onAdjust: (payload: {
    material_id: string;
    material_color_id?: string | null;
    new_qty: number;
    unit: string;
    notes?: string;
    minimum_stock: number;
  }) => Promise<void>;
}

export default function StockAdjustmentModal({
  open,
  onClose,
  target,
  onAdjust,
}: StockAdjustmentModalProps) {
  const [newStock, setNewStock] = useState<string>("");
  const [newMinStock, setNewMinStock] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (open && target) {
      setNewStock(String(target.currentStock));
      setNewMinStock(String(target.minimumStock || 0));
      setNotes("Stock opname & penyesuaian fisik");
      setError("");
    }
  }, [open, target]);

  if (!open || !target) return null;

  const currentNum = Number(target.currentStock) || 0;
  const newNum = Number(newStock) || 0;
  const diff = newNum - currentNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newNum < 0) {
      setError("Stok tidak boleh bernilai negatif.");
      return;
    }

    const minStockNum = Number(newMinStock) || 0;
    if (minStockNum < 0) {
      setError("Stok minimum tidak boleh bernilai negatif.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onAdjust({
        material_id: target!.materialId,
        material_color_id: target!.materialColorId,
        new_qty: newNum,
        unit: target!.unit,
        notes: notes.trim() || "Penyesuaian stok manual",
        minimum_stock: minStockNum,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui stok.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Sesuaikan Stok</h2>
              <p className="text-xs text-muted-foreground">Koreksi fisik atau stok awal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Info Barang */}
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-1">
            <p className="text-xs font-semibold text-foreground">{target.materialName}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {target.colorName && (
                <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-[11px]">
                  Warna: {target.colorName}
                </span>
              )}
              <span>Satuan: <strong className="text-foreground">{target.unit}</strong></span>
              <span>•</span>
              <span>Stok Sistem Saat Ini: <strong className="text-foreground">{target.currentStock} {target.unit}</strong></span>
            </div>
          </div>

          {/* Input Stok Baru */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Stok Fisik Nyata <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground pointer-events-none">
                  {target.unit}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Stok Minimum (Alert)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newMinStock}
                  onChange={(e) => setNewMinStock(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground pointer-events-none">
                  {target.unit}
                </span>
              </div>
            </div>
          </div>

          {/* Preview Selisih */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <span className="text-muted-foreground">Selisih Penyesuaian:</span>
            <span
              className={`font-semibold ${
                diff > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : diff < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground"
              }`}
            >
              {diff > 0 ? `+${diff}` : diff} {target.unit}
            </span>
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Alasan / Keterangan Penyesuaian
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Hasil stock opname bulanan"
              className={inputClass}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[100px]">
              {submitting ? "Menyimpan..." : "Simpan Stok"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
