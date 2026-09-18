import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Package,
  Layers,
  Search,
  ShoppingCart,
  Check,
  X,
} from "lucide-react";
import Button from "../ui/button";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import type { StockMovement } from "../../types";

interface PendingRequestsTabProps {
  pendingMovements: StockMovement[];
  loading: boolean;
  onConfirm: (movementId: string) => Promise<void>;
  onCancel: (movementId: string) => Promise<void>;
}

export default function PendingRequestsTab({
  pendingMovements,
  loading,
  onConfirm,
  onCancel,
}: PendingRequestsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = pendingMovements.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matName = m.materials?.name || "";
    const colorName = m.material_colors?.color_name || "";
    const notes = m.notes || "";
    return (
      matName.toLowerCase().includes(q) ||
      colorName.toLowerCase().includes(q) ||
      notes.toLowerCase().includes(q)
    );
  });

  const handleConfirm = async (movement: StockMovement) => {
    // Cek ketersediaan stok
    const currentStock = movement.material_color_id
      ? Number(movement.material_colors?.stock_qty) || 0
      : Number(movement.materials?.stock_qty) || 0;

    if (currentStock < movement.qty) {
      if (
        !window.confirm(
          `Peringatan: Stok tersedia di sistem (${currentStock} ${movement.unit}) lebih sedikit daripada yang diminta (${movement.qty} ${movement.unit}). Konfirmasi akan gagal jika stok minus. Tetap coba konfirmasi?`
        )
      ) {
        return;
      }
    }

    setProcessingId(movement.id);
    setActionError(null);
    try {
      await onConfirm(movement.id);
    } catch (err: any) {
      setActionError(err?.message || "Gagal mengonfirmasi pengambilan stok.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (movementId: string) => {
    if (!window.confirm("Yakin ingin membatalkan permintaan pengambilan stok ini?")) {
      return;
    }
    setProcessingId(movementId);
    setActionError(null);
    try {
      await onCancel(movementId);
    } catch (err: any) {
      setActionError(err?.message || "Gagal membatalkan permintaan stok.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive hover:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari order, material, atau warna..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4 text-amber-500" />
            <span>
              Total <strong className="text-foreground">{pendingMovements.length}</strong> permintaan menunggu konfirmasi staf gudang
            </span>
          </div>
        </div>
      </Card>

      {/* List / Table */}
      <Card className="overflow-hidden border border-border">
        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Memuat permintaan stok...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="mt-3 font-medium text-foreground text-sm">
              Semua Permintaan Sudah Diproses!
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tidak ada permintaan pengambilan bahan yang tertunda saat ini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((m) => {
              const isFabric = Boolean(m.material_color_id);
              const currentStock = isFabric
                ? Number(m.material_colors?.stock_qty) || 0
                : Number(m.materials?.stock_qty) || 0;
              const isEnough = currentStock >= m.qty;

              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* Left: Material info & notes */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 mt-0.5">
                      {isFabric ? (
                        <Layers className="h-4 w-4" />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {m.materials?.name || "Material"}
                        </span>

                        {m.material_colors && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">
                            {m.material_colors.color_code && (
                              <span
                                className="h-2 w-2 rounded-full border border-border/80"
                                style={{ backgroundColor: m.material_colors.color_code }}
                              />
                            )}
                            <span>{m.material_colors.color_name}</span>
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                          <Clock className="h-3 w-3" /> Menunggu Diambil
                        </span>
                      </div>

                      {/* Catatan / Keterangan Order */}
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {m.notes || "Permintaan dari pesanan"}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                        <span>
                          Waktu: {new Date(m.created_at).toLocaleString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>•</span>
                        <span>
                          Stok Saat Ini:{" "}
                          <strong
                            className={
                              isEnough
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            {currentStock} {m.unit}
                          </strong>
                        </span>
                        {!isEnough && (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" /> Kurang {(m.qty - currentStock).toFixed(2)} {m.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quantity & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-border/60 pt-3 sm:border-0 sm:pt-0 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted-foreground">Jumlah Diambil</p>
                      <p className="text-base font-bold text-foreground">
                        {m.qty.toLocaleString("id-ID")}{" "}
                        <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={processingId === m.id}
                        onClick={() => handleCancel(m.id)}
                        className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30 dark:text-rose-400"
                        title="Batalkan permintaan"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        <span>Batalkan</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={processingId === m.id}
                        onClick={() => handleConfirm(m)}
                        className={`h-8 text-xs font-semibold ${
                          isEnough
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-amber-600 hover:bg-amber-700 text-white"
                        }`}
                        title="Konfirmasi barang sudah diambil dari rak gudang"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        <span>
                          {processingId === m.id ? "Memproses..." : "Konfirmasi Ambil"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
