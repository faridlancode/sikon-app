import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Search,
  History,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  Layers,
} from "lucide-react";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import type { StockMovement } from "../../types";

interface StockHistoryTabProps {
  movements: StockMovement[];
  loading: boolean;
}

export default function StockHistoryTab({ movements, loading }: StockHistoryTabProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filtered = movements.filter((m) => {
    if (typeFilter !== "all" && m.movement_type !== typeFilter) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const mat = (m.materials?.name || "").toLowerCase();
      const col = (m.material_colors?.color_name || "").toLowerCase();
      const notes = (m.notes || "").toLowerCase();
      if (!mat.includes(q) && !col.includes(q) && !notes.includes(q)) return false;
    }
    return true;
  });

  const getSourceLabel = (sourceType: string | null) => {
    switch (sourceType) {
      case "purchase":
        return "Penerimaan Supplier";
      case "order_consumption":
        return "Konsumsi Order";
      case "initial":
        return "Stok Awal";
      case "manual":
        return "Penyesuaian Manual";
      default:
        return "Lainnya";
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Filter Toolbar ── */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari material, warna, atau catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Semua Tipe</option>
              <option value="in">Barang Masuk (+)</option>
              <option value="out">Barang Keluar (-)</option>
              <option value="adjustment">Penyesuaian Fisik</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Semua Status</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Table Audit Trail ── */}
      <Card className="overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-3.5 pl-4 pr-3">Waktu</th>
                <th className="px-3 py-3.5">Material & Varian</th>
                <th className="px-3 py-3.5">Tipe Mutasi</th>
                <th className="px-3 py-3.5 text-right">Perubahan Qty</th>
                <th className="px-3 py-3.5">Sumber & Keterangan</th>
                <th className="py-3.5 pl-3 pr-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    Memuat riwayat pergerakan stok...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <History className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 font-medium text-foreground">Belum ada mutasi stok</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pergerakan stok dari pesanan atau penerimaan barang akan tercatat di sini.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const isFabric = Boolean(m.material_color_id);
                  const isConfirmed = m.status === "confirmed";
                  const isPending = m.status === "pending";

                  return (
                    <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                      {/* Waktu */}
                      <td className="py-3.5 pl-4 pr-3 text-muted-foreground whitespace-nowrap">
                        <span className="font-medium text-foreground">
                          {new Date(m.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>

                      {/* Material & Varian */}
                      <td className="px-3 py-3.5 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            {isFabric ? (
                              <Layers className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Package className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground">
                              {m.materials?.name || "Material"}
                            </span>
                            {m.material_colors && (
                              <div className="flex items-center gap-1 mt-0.5">
                                {m.material_colors.color_code && (
                                  <span
                                    className="h-2 w-2 rounded-full border border-border"
                                    style={{ backgroundColor: m.material_colors.color_code }}
                                  />
                                )}
                                <span className="text-[11px] text-muted-foreground">
                                  {m.material_colors.color_name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tipe Mutasi */}
                      <td className="px-3 py-3.5">
                        {m.movement_type === "in" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <ArrowDownLeft className="h-3 w-3" /> Barang Masuk
                          </span>
                        ) : m.movement_type === "out" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
                            <ArrowUpRight className="h-3 w-3" /> Barang Keluar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-400">
                            <SlidersHorizontal className="h-3 w-3" /> Penyesuaian
                          </span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-bold ${
                            m.movement_type === "in"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : m.movement_type === "out"
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-sky-600 dark:text-sky-400"
                          }`}
                        >
                          {m.movement_type === "in"
                            ? `+${m.qty.toLocaleString("id-ID")}`
                            : m.movement_type === "out"
                            ? `-${m.qty.toLocaleString("id-ID")}`
                            : `${m.qty.toLocaleString("id-ID")}`}
                        </span>{" "}
                        <span className="text-[11px] text-muted-foreground">{m.unit}</span>
                      </td>

                      {/* Sumber & Catatan */}
                      <td className="px-3 py-3.5 max-w-xs">
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {getSourceLabel(m.source_type)}
                        </span>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {m.notes || "—"}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 pl-3 pr-4 text-center">
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmed
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            <Clock className="h-3.5 w-3.5" /> Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground line-through">
                            <XCircle className="h-3.5 w-3.5" /> Batal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
