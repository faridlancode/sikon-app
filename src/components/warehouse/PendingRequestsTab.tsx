import { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Package,
  Layers,
  Search,
  Check,
  X,
  User,
  Scissors,
  Shirt,
  Warehouse,
} from "lucide-react";
import Button from "../ui/button";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import { useStaff } from "../../hooks/useStaff";
import type { StockMovement } from "../../types";

interface PendingRequestsTabProps {
  pendingMovements: StockMovement[];
  loading: boolean;
  onConfirm: (movementId: string, takenBy?: string | null, recordedBy?: string | null) => Promise<void>;
  onCancel: (movementId: string) => Promise<void>;
}

export default function PendingRequestsTab({
  pendingMovements,
  loading,
  onConfirm,
  onCancel,
}: PendingRequestsTabProps) {
  const { activeStaff } = useStaff();
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Per-movement staff selections: movementId -> staffId
  const [takenByMap, setTakenByMap] = useState<Record<string, string>>({});
  const [recordedByMap, setRecordedByMap] = useState<Record<string, string>>({});

  const gudangStaff = useMemo(() => activeStaff.filter((s) => s.role === "Gudang"), [activeStaff]);
  const cuttingStaff = useMemo(() => activeStaff.filter((s) => s.role === "Tukang Potong"), [activeStaff]);
  const sewingStaff = useMemo(() => activeStaff.filter((s) => s.role === "Penjahit"), [activeStaff]);

  // Movements filtered for outgoing pending only
  const outgoingPendingMovements = useMemo(() => {
    return pendingMovements.filter((m) => m.movement_type === "out");
  }, [pendingMovements]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return outgoingPendingMovements;
    const q = searchQuery.toLowerCase();
    return outgoingPendingMovements.filter((m) => {
      const matName = m.materials?.name || "";
      const colorName = m.material_colors?.color_name || "";
      const notes = m.notes || "";
      return (
        matName.toLowerCase().includes(q) ||
        colorName.toLowerCase().includes(q) ||
        notes.toLowerCase().includes(q)
      );
    });
  }, [outgoingPendingMovements, searchQuery]);

  // Grouping by order (via notes / source_id)
  const groupedMovements = useMemo(() => {
    const groups: { [key: string]: { label: string; items: StockMovement[] } } = {};
    for (const m of filtered) {
      const groupKey = m.source_id || m.notes || "Umum";
      const label = m.notes ? m.notes.split("—")[0].trim() : "Permintaan Pengambilan Barang";
      if (!groups[groupKey]) {
        groups[groupKey] = { label, items: [] };
      }
      groups[groupKey].items.push(m);
    }
    return Object.values(groups);
  }, [filtered]);

  const handleConfirm = async (movement: StockMovement) => {
    // Cek ketersediaan stok
    const currentStock = movement.material_color_id
      ? Number(movement.material_colors?.stock_qty) || 0
      : Number(movement.materials?.stock_qty) || 0;

    if (currentStock < movement.qty) {
      if (
        !window.confirm(
          `Peringatan: Stok tersedia di sistem (${currentStock} ${movement.unit}) lebih sedikit daripada yang diminta (${movement.qty} ${movement.unit}). Konfirmasi akan gagal jika stok fisik minus. Tetap lanjutkan?`
        )
      ) {
        return;
      }
    }

    const takenBy = takenByMap[movement.id] || null;
    const recordedBy = recordedByMap[movement.id] || gudangStaff[0]?.id || null;

    if (!takenBy) {
      const isFabric = Boolean(
        movement.material_color_id || movement.materials?.material_categories?.is_fabric
      );
      const roleName = isFabric ? "Tukang Potong" : "Penjahit";
      if (
        !window.confirm(
          `Staf yang mengambil (${roleName}) belum dipilih. Tetap konfirmasi tanpa mencatat nama pengambil?`
        )
      ) {
        return;
      }
    }

    setProcessingId(movement.id);
    setActionError(null);
    try {
      await onConfirm(movement.id, takenBy, recordedBy);
    } catch (err: any) {
      setActionError(err?.message || "Gagal mengonfirmasi pengeluaran stok.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (movementId: string) => {
    if (!window.confirm("Yakin ingin membatalkan permintaan pengeluaran stok ini?")) {
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
              Total <strong className="text-foreground">{outgoingPendingMovements.length}</strong> bahan siap dikeluarkan dari rak gudang
            </span>
          </div>
        </div>
      </Card>

      {/* List / Groups */}
      {loading ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
          Memuat daftar barang keluar...
        </div>
      ) : groupedMovements.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 font-medium text-foreground text-sm">
            Semua Barang Keluar Sudah Dikonfirmasi!
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tidak ada permintaan pengambilan bahan baku yang tertunda saat ini.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedMovements.map((group, groupIdx) => (
            <Card key={groupIdx} className="overflow-hidden border border-border">
              {/* Group Header */}
              <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold text-foreground flex items-center justify-between">
                <span>{group.label}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {group.items.length} item bahan
                </span>
              </div>

              {/* Items in Group */}
              <div className="divide-y divide-border/60">
                {group.items.map((m) => {
                  const isFabric = Boolean(
                    m.material_color_id || m.materials?.material_categories?.is_fabric
                  );
                  const currentStock = isFabric
                    ? Number(m.material_colors?.stock_qty) || 0
                    : Number(m.materials?.stock_qty) || 0;
                  const isEnough = currentStock >= m.qty;

                  // Staf selection options based on material type
                  const relevantStaff = isFabric
                    ? cuttingStaff.length > 0
                      ? cuttingStaff
                      : activeStaff
                    : sewingStaff.length > 0
                    ? sewingStaff
                    : activeStaff;

                  const takenByValue = takenByMap[m.id] !== undefined
                    ? takenByMap[m.id]
                    : (relevantStaff[0]?.id || "");

                  const recordedByValue = recordedByMap[m.id] !== undefined
                    ? recordedByMap[m.id]
                    : (gudangStaff[0]?.id || "");

                  return (
                    <div
                      key={m.id}
                      className="p-4 transition-colors hover:bg-muted/30 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                    >
                      {/* Left: Material Info */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 mt-0.5">
                          {isFabric ? <Layers className="h-4 w-4" /> : <Package className="h-4 w-4" />}
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
                              <Clock className="h-3 w-3" /> Siap Diambil
                            </span>
                          </div>

                          <p className="text-xs text-muted-foreground">{m.notes || "—"}</p>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                            <span>
                              Stok di Rak:{" "}
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

                      {/* Middle: Selection of Taken By & Recorded By */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/70 shrink-0 lg:w-96">
                        <label className="block">
                          <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-700">
                            {isFabric ? <Scissors className="h-3 w-3 text-purple-600" /> : <Shirt className="h-3 w-3 text-blue-600" />}
                            Diambil oleh ({isFabric ? "Tukang Potong" : "Penjahit"}):
                          </span>
                          <select
                            value={takenByValue}
                            onChange={(e) =>
                              setTakenByMap((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            className={`${inputClass} h-7 py-0.5 text-xs bg-white`}
                          >
                            <option value="">-- Pilih Staf --</option>
                            {relevantStaff.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.role || "Staf"})
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-700">
                            <Warehouse className="h-3 w-3 text-amber-600" />
                            Dicatat oleh (Gudang):
                          </span>
                          <select
                            value={recordedByValue}
                            onChange={(e) =>
                              setRecordedByMap((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            className={`${inputClass} h-7 py-0.5 text-xs bg-white`}
                          >
                            <option value="">-- Pilih Staf Gudang --</option>
                            {gudangStaff.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.role})
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {/* Right: Quantity & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-left sm:text-right">
                          <p className="text-[10px] text-muted-foreground uppercase">Qty Keluar</p>
                          <p className="text-base font-bold text-foreground">
                            {m.qty.toLocaleString("id-ID")}{" "}
                            <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={processingId === m.id}
                            onClick={() => handleCancel(m.id)}
                            className="h-8 text-xs text-muted-foreground hover:text-rose-600"
                            title="Batalkan pengambilan bahan"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            disabled={processingId === m.id}
                            onClick={() => handleConfirm(m)}
                            className={`h-8 gap-1 text-xs font-semibold text-white ${
                              isEnough
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-amber-600 hover:bg-amber-700"
                            }`}
                            title="Konfirmasi bahan sudah diserahkan"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{processingId === m.id ? "..." : "Konfirmasi Keluar"}</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
