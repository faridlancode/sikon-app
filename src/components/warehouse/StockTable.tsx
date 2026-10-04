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
  ChevronUp,
  CircleHelp,
  RefreshCw,
} from "lucide-react";
import Button from "../ui/button";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import StockAdjustmentModal from "./StockAdjustmentModal";
import { supabase } from "../../lib/supabaseClient";
import type { Material, MaterialCategory, MaterialColor } from "../../types";
import { getMaterialPurchaseUnits, getPrimaryPurchaseUnit } from "../../utils/materialUnits";
import { formatPurchaseUnit } from "../../utils/formatCurrency";

type StockStatus = "safe" | "low" | "out" | "unset";

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
  const [statusFilter, setStatusFilter] = useState<"all" | StockStatus>("all");
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Record<string, boolean>>({});
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

  const toggleMaterial = (materialId: string) => {
    setExpandedMaterialIds((prev) => ({
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
      status: StockStatus;
    }> = [];

    for (const m of materials) {
      const isFabric = Boolean(m.material_categories?.is_fabric);
      const catName = m.material_categories?.name || "Lainnya";
      const colors = colorsByMaterial[m.id] || [];

      if (colors.length > 0) {
        for (const c of colors) {
          const qty = Number(c.stock_qty) || 0;
          const min = Number(c.minimum_stock) || 0;
          const status: StockStatus =
            min <= 0 ? "unset" : qty <= 0 ? "out" : qty <= min ? "low" : "safe";
          items.push({
            key: `${m.id}-${c.id}`,
            materialId: m.id,
            materialName: m.name,
            categoryName: catName,
            isFabric,
            materialColorId: c.id,
            colorName: c.color_name,
            colorCode: c.color_code,
            stockQty: qty,
            minimumStock: min,
            unit: m.unit,
            status,
          });
        }
      } else {
        const qty = Number(m.stock_qty) || 0;
        const min = Number(m.minimum_stock) || 0;
        const status: StockStatus =
          min <= 0 ? "unset" : qty <= 0 ? "out" : qty <= min ? "low" : "safe";
        items.push({
          key: m.id,
          materialId: m.id,
          materialName: m.name,
          categoryName: catName,
          isFabric,
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
    let unset = 0;

    for (const item of stockItems) {
      if (item.status === "safe") safe++;
      else if (item.status === "low") low++;
      else if (item.status === "out") out++;
      else unset++;
    }

    return { total: stockItems.length, safe, low, out, unset };
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

  const materialGroups = useMemo(() => {
    const groups = new Map<string, typeof filteredItems>();
    for (const item of filteredItems) {
      const group = groups.get(item.materialId);
      if (group) group.push(item);
      else groups.set(item.materialId, [item]);
    }
    return Array.from(groups.values());
  }, [filteredItems]);

  const handleAdjust = async (payload: any) => {
    await onAdjustStock(payload);
    await fetchAllColors();
    onRefresh();
  };

  const renderStockRow = (item: (typeof stockItems)[number], isDetail = false) => {
    const material = materials.find((candidate) => candidate.id === item.materialId);
    const purchaseUnits = material ? getMaterialPurchaseUnits(material) : [];
    const primaryPurchaseUnit = getPrimaryPurchaseUnit(purchaseUnits);
    const hasFixedPrimaryUnit = Boolean(
      primaryPurchaseUnit &&
      !primaryPurchaseUnit.is_variable &&
      primaryPurchaseUnit.name !== item.unit &&
      Number(primaryPurchaseUnit.conversion_rate) > 0
    );

    return (
      <tr key={item.key} className="group transition-colors hover:bg-muted/40">
        <td className={`py-3 pr-3 font-medium text-foreground ${isDetail ? "pl-10" : "pl-4"}`}>
          {isDetail ? (
            <span className="text-xs text-muted-foreground">Varian warna</span>
          ) : (
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
          )}
        </td>
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
            <span className="text-[11px] italic text-muted-foreground">Tanpa varian spesifik</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Stok utama</span>
          )}
        </td>
        <td className="px-3 py-3 text-right">
          {hasFixedPrimaryUnit && primaryPurchaseUnit ? (
            <>
              <div className="text-sm font-bold text-foreground">
                {(item.stockQty / Number(primaryPurchaseUnit.conversion_rate)).toLocaleString(
                  "id-ID",
                  { maximumFractionDigits: 2 }
                )}{" "}
                {formatPurchaseUnit(primaryPurchaseUnit.name)}
              </div>
              <p className="text-[10px] leading-tight text-muted-foreground/75">
                {item.stockQty.toLocaleString("id-ID")} {item.unit}
              </p>
            </>
          ) : (
            <>
              <span className="text-sm font-bold text-foreground">
                {item.stockQty.toLocaleString("id-ID")}
              </span>{" "}
              <span className="text-[11px] text-muted-foreground">{item.unit}</span>
            </>
          )}
        </td>
        <td className="px-3 py-3 text-right text-muted-foreground">
          <span>{item.minimumStock.toLocaleString("id-ID")}</span>{" "}
          <span className="text-[10px]">{item.unit}</span>
        </td>
        <td className="px-3 py-3 text-center">
          {item.status === "unset" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
              <CircleHelp className="h-3 w-3" />
              Belum diset
            </span>
          ) : item.status === "safe" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold text-white dark:border-emerald-600 dark:bg-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Aman
            </span>
          ) : item.status === "low" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-700 bg-amber-700 px-2.5 py-0.5 text-[10px] font-semibold text-white dark:border-amber-600 dark:bg-amber-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Menipis
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-700 bg-rose-700 px-2.5 py-0.5 text-[10px] font-semibold text-white dark:border-rose-600 dark:bg-rose-600">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Habis
            </span>
          )}
        </td>
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
            className="h-7 gap-1 text-xs opacity-90 group-hover:opacity-100"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Sesuaikan</span>
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div
          onClick={() => setStatusFilter("all")}
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${statusFilter === "all"
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
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${statusFilter === "safe"
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
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${statusFilter === "low"
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
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${statusFilter === "out"
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

        <div
          onClick={() => setStatusFilter("unset")}
          className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${statusFilter === "unset"
              ? "border-slate-500 bg-slate-100 ring-2 ring-slate-500/20 shadow-sm dark:bg-slate-900/40"
              : "border-border bg-card hover:border-slate-300 hover:bg-muted/30"
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Min. belum diset</span>
            <CircleHelp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">{stats.unset}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Atur batas minimum stok</p>
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
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                      <span>Memuat stok material...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
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
                materialGroups.flatMap((group) => {
                  const firstItem = group[0];
                  const hasColorVariants = group.some((item) => item.materialColorId !== null);
                  if (!hasColorVariants) return [renderStockRow(firstItem)];

                  const isExpanded = Boolean(expandedMaterialIds[firstItem.materialId]);
                  const totalStock = group.reduce((total, item) => total + item.stockQty, 0);
                  const totalMinimum = group.reduce((total, item) => total + item.minimumStock, 0);
                  const safeCount = group.filter((item) => item.status === "safe").length;
                  const lowCount = group.filter((item) => item.status === "low").length;
                  const outCount = group.filter((item) => item.status === "out").length;
                  const unsetCount = group.filter((item) => item.status === "unset").length;
                  const material = materials.find((candidate) => candidate.id === firstItem.materialId);
                  const primaryUnit = material
                    ? getPrimaryPurchaseUnit(getMaterialPurchaseUnits(material))
                    : undefined;
                  const hasFixedPrimaryUnit = Boolean(
                    primaryUnit &&
                    !primaryUnit.is_variable &&
                    primaryUnit.name !== firstItem.unit &&
                    Number(primaryUnit.conversion_rate) > 0
                  );

                  return [
                    <tr
                      key={`group-${firstItem.materialId}`}
                      className="bg-muted/20 transition-colors hover:bg-muted/40"
                    >
                      <td className="py-3 pl-4 pr-3">
                        <button
                          type="button"
                          onClick={() => toggleMaterial(firstItem.materialId)}
                          aria-expanded={isExpanded}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            {firstItem.isFabric ? (
                              <Layers className="h-3.5 w-3.5" />
                            ) : (
                              <Package className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground">
                              {firstItem.materialName}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {firstItem.categoryName} · {group.length} varian
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {isExpanded ? "Rincian tiap varian" : "Klik untuk melihat rincian"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {hasFixedPrimaryUnit && primaryUnit ? (
                          <>
                            <div className="text-sm font-bold text-foreground">
                              {(totalStock / Number(primaryUnit.conversion_rate)).toLocaleString(
                                "id-ID",
                                { maximumFractionDigits: 2 }
                              )}{" "}
                              {formatPurchaseUnit(primaryUnit.name)}
                            </div>
                            <p className="text-[10px] leading-tight text-muted-foreground/75">
                              {totalStock.toLocaleString("id-ID")} {firstItem.unit}
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-bold text-foreground">
                              {totalStock.toLocaleString("id-ID")}
                            </span>{" "}
                            <span className="text-[11px] text-muted-foreground">
                              {firstItem.unit}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {totalMinimum.toLocaleString("id-ID")}{" "}
                        <span className="text-[10px]">{firstItem.unit}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-center gap-1">
                          {outCount > 0 && (
                            <span className="rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-rose-600">
                              {outCount} habis
                            </span>
                          )}
                          {lowCount > 0 && (
                            <span className="rounded-full bg-amber-700 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-amber-600">
                              {lowCount} menipis
                            </span>
                          )}
                          {safeCount > 0 && (
                            <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-emerald-600">
                              {safeCount} aman
                            </span>
                          )}
                          {unsetCount > 0 && (
                            <span className="rounded-full bg-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                              {unsetCount} belum diset
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMaterial(firstItem.materialId)}
                          aria-expanded={isExpanded}
                          aria-label={`Detail varian ${firstItem.materialName}`}
                          className="h-7 gap-1 text-xs"
                        >
                          <span>Detail varian</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>,
                    ...(isExpanded ? group.map((item) => renderStockRow(item, true)) : []),
                  ];
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
