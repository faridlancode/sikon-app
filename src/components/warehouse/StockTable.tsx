import { useState, useMemo, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  Package,
  Layers,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import Button from "../ui/button";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import StockAdjustmentModal from "./StockAdjustmentModal";
import { supabase } from "../../lib/supabaseClient";
import type { Material, MaterialCategory, MaterialColor } from "../../types";

interface StockTableProps {
  materials: Material[];
  categories: MaterialCategory[];
  loading: boolean;
  onRefresh: () => void;
  onAdjustStock: (payload: {
    material_id: string;
    material_color_id?: string | null;
    new_qty: number;
    unit: string;
    notes?: string;
    minimum_stock: number;
  }) => Promise<void>;
}

export default function StockTable({
  materials,
  categories,
  loading,
  onRefresh,
  onAdjustStock,
}: StockTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "safe" | "low" | "out">("all");
  const [expandedFabricIds, setExpandedFabricIds] = useState<Record<string, boolean>>({});
  const [colorsByMaterial, setColorsByMaterial] = useState<Record<string, MaterialColor[]>>({});
  const [colorsLoading, setColorsLoading] = useState(false);

  // Modal adjustment state
  const [adjustmentTarget, setAdjustmentTarget] = useState<any | null>(null);

  // Fetch all active material colors for fabrics
  const fetchAllColors = async () => {
    setColorsLoading(true);
    try {
      const { data, error } = await supabase
        .from("material_colors")
        .select("*")
        .eq("is_active", true)
        .order("color_name", { ascending: true });

      if (!error && data) {
        const grouped: Record<string, MaterialColor[]> = {};
        for (const c of data) {
          if (!grouped[c.material_id]) grouped[c.material_id] = [];
          grouped[c.material_id].push(c);
        }
        setColorsByMaterial(grouped);
      }
    } catch (e) {
      console.error("Gagal memuat daftar warna:", e);
    } finally {
      setColorsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllColors();
  }, []);

  const toggleExpand = (materialId: string) => {
    setExpandedFabricIds((prev) => ({
      ...prev,
      [materialId]: !prev[materialId],
    }));
  };

  // Flatten rows for stock calculations and display
  const stockItems = useMemo(() => {
    const items: Array<{
      key: string;
      materialId: string;
      materialName: string;
      categoryName: string;
      isFabric: boolean;
      materialColorId: string | null;
      colorName: string | null;
      colorCode: string | null;
      stockQty: number;
      minimumStock: number;
      unit: string;
      status: "safe" | "low" | "out";
    }> = [];

    for (const m of materials) {
      const isFabric = Boolean(m.material_categories?.is_fabric);
      const catName = m.material_categories?.name || "Lainnya";

      if (isFabric) {
        const colors = colorsByMaterial[m.id] || [];
        if (colors.length === 0) {
          // Kain tapi belum punya warna
          const qty = Number(m.stock_qty) || 0;
          const min = Number(m.minimum_stock) || 0;
          const status = qty <= 0 ? "out" : qty <= min ? "low" : "safe";
          items.push({
            key: `${m.id}-none`,
            materialId: m.id,
            materialName: m.name,
            categoryName: catName,
            isFabric: true,
            materialColorId: null,
            colorName: null,
            colorCode: null,
            stockQty: qty,
            minimumStock: min,
            unit: m.unit,
            status,
          });
        } else {
          for (const c of colors) {
            const qty = Number(c.stock_qty) || 0;
            const min = Number(c.minimum_stock) || 0;
            const status = qty <= 0 ? "out" : qty <= min ? "low" : "safe";
            items.push({
              key: `${m.id}-${c.id}`,
              materialId: m.id,
              materialName: m.name,
              categoryName: catName,
              isFabric: true,
              materialColorId: c.id,
              colorName: c.color_name,
              colorCode: c.color_code,
              stockQty: qty,
              minimumStock: min,
              unit: m.unit,
              status,
            });
          }
        }
      } else {
        // Non-kain (aksesoris, benang, kancing, dll)
        const qty = Number(m.stock_qty) || 0;
        const min = Number(m.minimum_stock) || 0;
        const status = qty <= 0 ? "out" : qty <= min ? "low" : "safe";
        items.push({
          key: m.id,
          materialId: m.id,
          materialName: m.name,
          categoryName: catName,
          isFabric: false,
          materialColorId: null,
          colorName: null,
          colorCode: null,
          stockQty: qty,
          minimumStock: min,
          unit: m.unit,
          status,
        });
      }
    }

    return items;
  }, [materials, colorsByMaterial]);

  // Summary counts
  const stats = useMemo(() => {
    let safe = 0;
    let low = 0;
    let out = 0;

    for (const item of stockItems) {
      if (item.status === "safe") safe++;
      else if (item.status === "low") low++;
      else if (item.status === "out") out++;
    }

    return { total: stockItems.length, safe, low, out };
  }, [stockItems]);

  // Filtered list
  const filteredItems = useMemo(() => {
    return stockItems.filter((item) => {
      // Category filter
      if (selectedCategoryId !== "all") {
        const mat = materials.find((m) => m.id === item.materialId);
        if (mat?.category_id !== selectedCategoryId) return false;
      }

      // Status filter
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${item.materialName} ${item.colorName || ""} ${item.categoryName} ${item.unit}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [stockItems, selectedCategoryId, statusFilter, searchQuery, materials]);

  const handleAdjust = async (payload: any) => {
    await onAdjustStock(payload);
    await fetchAllColors();
    onRefresh();
  };

  return (
    <div className="space-y-5">
      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          onClick={() => setStatusFilter("all")}
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${
            statusFilter === "all"
              ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
              : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Item</span>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Semua varian material</p>
        </div>

        <div
          onClick={() => setStatusFilter("safe")}
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${
            statusFilter === "safe"
              ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20 shadow-sm"
              : "border-border bg-card hover:border-emerald-200 hover:bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Stok Aman</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats.safe}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Di atas batas minimum</p>
        </div>

        <div
          onClick={() => setStatusFilter("low")}
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${
            statusFilter === "low"
              ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 ring-2 ring-amber-500/20 shadow-sm"
              : "border-border bg-card hover:border-amber-200 hover:bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Menipis</span>
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.low}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Mendekati / di batas min.</p>
        </div>

        <div
          onClick={() => setStatusFilter("out")}
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${
            statusFilter === "out"
              ? "border-rose-500 bg-rose-50/60 dark:bg-rose-950/20 ring-2 ring-rose-500/20 shadow-sm"
              : "border-border bg-card hover:border-rose-200 hover:bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400">Habis</span>
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-400">{stats.out}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Perlu segera dipesan</p>
        </div>
      </div>

      {/* ── Filters & Search ── */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari material, warna, atau satuan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_fabric ? "(Kain)" : ""}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onRefresh();
                fetchAllColors();
              }}
              title="Perbarui Data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Table ── */}
      <Card className="overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-3.5 pl-4 pr-3">Material</th>
                <th className="px-3 py-3.5">Kategori</th>
                <th className="px-3 py-3.5">Varian / Warna</th>
                <th className="px-3 py-3.5 text-right">Stok Fisik</th>
                <th className="px-3 py-3.5 text-right">Min. Stok</th>
                <th className="px-3 py-3.5 text-center">Status</th>
                <th className="py-3.5 pl-3 pr-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading || colorsLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                      <span>Memuat stok material...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 font-medium text-foreground">Tidak ada material ditemukan</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {searchQuery || statusFilter !== "all" || selectedCategoryId !== "all"
                        ? "Coba ubah kriteria pencarian atau filter Anda."
                        : "Tambahkan material terlebih dahulu di menu Material."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  return (
                    <tr
                      key={item.key}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      {/* Nama Material */}
                      <td className="py-3 pl-4 pr-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            {item.isFabric ? (
                              <Layers className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Package className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground">{item.materialName}</span>
                            <p className="text-[10px] text-muted-foreground">Satuan: {item.unit}</p>
                          </div>
                        </div>
                      </td>

                      {/* Kategori */}
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {item.categoryName}
                        </span>
                      </td>

                      {/* Warna / Varian */}
                      <td className="px-3 py-3">
                        {item.colorName ? (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                            {item.colorCode && (
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-border/80 shadow-xs"
                                style={{ backgroundColor: item.colorCode }}
                              />
                            )}
                            <span>{item.colorName}</span>
                          </div>
                        ) : item.isFabric ? (
                          <span className="text-[11px] italic text-muted-foreground">
                            Tanpa varian spesifik
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Stok Fisik */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-bold text-foreground">
                          {item.stockQty.toLocaleString("id-ID")}
                        </span>{" "}
                        <span className="text-[11px] text-muted-foreground">{item.unit}</span>
                      </td>

                      {/* Min. Stok */}
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        <span>{item.minimumStock.toLocaleString("id-ID")}</span>{" "}
                        <span className="text-[10px]">{item.unit}</span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-3 py-3 text-center">
                        {item.status === "safe" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Aman
                          </span>
                        ) : item.status === "low" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Menipis
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Habis
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 pl-3 pr-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setAdjustmentTarget({
                              materialId: item.materialId,
                              materialName: item.materialName,
                              materialColorId: item.materialColorId,
                              colorName: item.colorName,
                              unit: item.unit,
                              currentStock: item.stockQty,
                              minimumStock: item.minimumStock,
                              categoryName: item.categoryName,
                              isFabric: item.isFabric,
                            })
                          }
                          className="h-7 text-xs gap-1 opacity-90 group-hover:opacity-100"
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          <span>Sesuaikan</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Adjustment Modal */}
      <StockAdjustmentModal
        open={Boolean(adjustmentTarget)}
        onClose={() => setAdjustmentTarget(null)}
        target={adjustmentTarget}
        onAdjust={handleAdjust}
      />
    </div>
  );
}
