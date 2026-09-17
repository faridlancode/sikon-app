import { useEffect, useMemo, useState } from "react";
import {
  X,
  Pencil,
  Shirt,
  Package,
  Scissors,
  Layers,
  Calculator,
  RotateCcw,
  Tag,
  Sparkles,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Button from "../ui/button";
import { inputClass } from "../ui/FormField";
import { formatIDR, formatIDRInput, parseIDRInput } from "../../utils/formatCurrency";
import { EMBROIDERY_PRESET_SPOTS } from "../../utils/embroideryHelpers";
import type { ProductWithDetails } from "../../hooks/useProducts";
import type { Material } from "../../types";

interface ProductDetailModalProps {
  open: boolean;
  product: ProductWithDetails | null;
  allMaterials: Material[];
  onClose: () => void;
  onEdit: (product: ProductWithDetails) => void;
}

export default function ProductDetailModal({
  open,
  product,
  allMaterials,
  onClose,
  onEdit,
}: ProductDetailModalProps) {
  const [fabricSelections, setFabricSelections] = useState<Record<string, string>>({});
  const [embroideryMode, setEmbroideryMode] = useState<"none" | "flat" | "spots">("none");
  const [embroideryFlatCost, setEmbroideryFlatCost] = useState<string>("40000");
  const [selectedSpots, setSelectedSpots] = useState<Record<string, number>>({});

  useEffect(() => {
    setFabricSelections({});
    setEmbroideryMode("none");
    setEmbroideryFlatCost("40000");
    setSelectedSpots({});
  }, [product?.id]);

  const fabricMaterials = useMemo(
    () =>
      allMaterials.filter(
        (material) => material.is_active && material.material_categories?.is_fabric
      ),
    [allMaterials]
  );

  if (!open || !product) return null;

  const defaultPrice = Number(product.default_price) || 0;
  const cuttingCost = Number(product.cutting_cost_per_pcs) || 0;
  const sewingCost = Number(product.sewing_cost_per_pcs) || 0;
  const materials = product.product_materials ?? [];
  const fabricSlots = product.product_fabric_slots ?? [];

  const materialsCost = materials.reduce((total, line) => {
    return total + (Number(line.quantity) || 0) * (Number(line.materials?.price) || 0);
  }, 0);

  const baseHpp = cuttingCost + sewingCost + materialsCost;

  const fabricCost = fabricSlots.reduce((total, slot) => {
    const selectedMaterial = fabricMaterials.find(
      (material) => material.id === fabricSelections[slot.id || slot.label]
    );
    return total + (Number(slot.usage_qty) || 0) * (Number(selectedMaterial?.price) || 0);
  }, 0);

  // Calculate embroidery cost based on mode
  let embroideryCost = 0;
  if (embroideryMode === "flat") {
    embroideryCost = parseIDRInput(embroideryFlatCost);
  } else if (embroideryMode === "spots") {
    embroideryCost = Object.values(selectedSpots).reduce((sum, cost) => sum + cost, 0);
  }

  const simulatedHpp = baseHpp + fabricCost + embroideryCost;

  // Margin calculation
  const profitPerPcs = defaultPrice - simulatedHpp;
  const marginPct = defaultPrice > 0 ? Math.round((profitPerPcs / defaultPrice) * 100) : 0;
  const markupPct = simulatedHpp > 0 ? Math.round((profitPerPcs / simulatedHpp) * 100) : 0;

  function materialsForSlot(slot: (typeof fabricSlots)[number]) {
    return fabricMaterials.filter(
      (material) =>
        !slot.fabric_category_id || material.category_id === slot.fabric_category_id
    );
  }

  function toggleSpot(spotName: string) {
    setSelectedSpots((prev) => {
      const next = { ...prev };
      if (next[spotName] !== undefined) {
        delete next[spotName];
      } else {
        // default estimate: Punggung 20k, others 5k
        next[spotName] = spotName.toLowerCase().includes("punggung") ? 20000 : 5000;
      }
      return next;
    });
  }

  function updateSpotCost(spotName: string, costStr: string) {
    const cost = parseIDRInput(costStr);
    setSelectedSpots((prev) => ({
      ...prev,
      [spotName]: cost,
    }));
  }

  function resetSimulation() {
    setFabricSelections({});
    setEmbroideryMode("none");
    setEmbroideryFlatCost("40000");
    setSelectedSpots({});
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="border-b border-border bg-gradient-to-br from-primary/10 via-card to-card px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Shirt className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                    Katalog Produk
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      product.is_active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    {product.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <h2 className="truncate text-xl font-bold text-foreground">{product.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {product.product_categories?.name || "Tanpa kategori"}
                  </span>
                  {product.description && (
                    <>
                      <span>•</span>
                      <span>{product.description}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Tutup detail"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Quick Metrics */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <Calculator className="h-3.5 w-3.5" />
                HPP Dasar / pcs
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                {formatIDR(baseHpp)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Potong + Jahit + Bahan fix</p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                <Tag className="h-3.5 w-3.5" />
                Harga Jual Standar
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-950">
                {defaultPrice > 0 ? formatIDR(defaultPrice) : "Belum diatur"}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-800/70">
                {defaultPrice > 0 ? "Patokan harga saat order" : "Edit untuk mengatur"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Slot Kain
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">{fabricSlots.length}</p>
              <p className="text-[11px] text-muted-foreground">kebutuhan kain</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Bahan Fix
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">{materials.length}</p>
              <p className="text-[11px] text-muted-foreground">aksesoris BOM</p>
            </div>
          </section>

          {/* SIMULASI HPP, BORDIR & MARGIN */}
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-emerald-950">
                    Simulasi HPP, Bordir &amp; Analisis Margin
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-emerald-900/75">
                  Uji coba kombinasi kain dan biaya bordir untuk melihat estimasi HPP total dan laba kotor.
                </p>
              </div>
              <button
                type="button"
                onClick={resetSimulation}
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                title="Reset simulasi"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            {/* 1. Simulasi Kain */}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                <Shirt className="h-3.5 w-3.5 text-emerald-700" />
                1. Pilih Kain per Slot
              </p>
              {fabricSlots.length === 0 ? (
                <p className="rounded-xl border border-dashed border-emerald-200 bg-white/60 px-3 py-2 text-xs text-emerald-800/70">
                  Produk tidak memiliki slot kain.
                </p>
              ) : (
                fabricSlots.map((slot) => {
                  const slotKey = slot.id || slot.label;
                  const options = materialsForSlot(slot);
                  const selectedMaterial = fabricMaterials.find(
                    (material) => material.id === fabricSelections[slotKey]
                  );
                  const lineCost =
                    (Number(slot.usage_qty) || 0) * (Number(selectedMaterial?.price) || 0);
                  return (
                    <div
                      key={slotKey}
                      className="grid gap-2 rounded-xl border border-emerald-200 bg-white/90 p-2.5 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center"
                    >
                      <div>
                        <p className="text-xs font-medium text-foreground">{slot.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {slot.usage_qty} {slot.unit} / pcs
                          {slot.material_categories?.name
                            ? ` · ${slot.material_categories.name}`
                            : ""}
                        </p>
                      </div>
                      <select
                        value={fabricSelections[slotKey] || ""}
                        onChange={(event) =>
                          setFabricSelections((current) => ({
                            ...current,
                            [slotKey]: event.target.value,
                          }))
                        }
                        className={`${inputClass} h-8 py-1 text-xs`}
                      >
                        <option value="">Pilih kain simulasi</option>
                        {options.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name} · {formatIDR(material.price)} / {material.unit}
                          </option>
                        ))}
                      </select>
                      <span className="text-right text-xs font-semibold tabular-nums text-emerald-800">
                        {selectedMaterial ? formatIDR(lineCost) : "—"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* 2. Simulasi Bordir */}
            <div className="mt-5 space-y-2 border-t border-emerald-200/80 pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                  <Scissors className="h-3.5 w-3.5 text-emerald-700" />
                  2. Simulasi Biaya Bordir / Makloon
                </p>
                {/* Mode Selector */}
                <div className="inline-flex rounded-lg border border-emerald-300 bg-white/80 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setEmbroideryMode("none")}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      embroideryMode === "none"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-emerald-900 hover:bg-emerald-100/60"
                    }`}
                  >
                    Tanpa Bordir
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbroideryMode("flat")}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      embroideryMode === "flat"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-emerald-900 hover:bg-emerald-100/60"
                    }`}
                  >
                    Flat / Pcs
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbroideryMode("spots")}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      embroideryMode === "spots"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-emerald-900 hover:bg-emerald-100/60"
                    }`}
                  >
                    Pilih Titik
                  </button>
                </div>
              </div>

              {/* Mode: Flat */}
              {embroideryMode === "flat" && (
                <div className="rounded-xl border border-emerald-200 bg-white/90 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">Harga Bordir per Pcs</p>
                    <p className="text-[11px] text-muted-foreground">
                      Cocok untuk vendor borongan / paket kemeja utuh
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={embroideryFlatCost}
                      onChange={(e) => setEmbroideryFlatCost(formatIDRInput(e.target.value))}
                      className={`${inputClass} text-right text-xs font-semibold h-9`}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {/* Mode: Spots (Titik) */}
              {embroideryMode === "spots" && (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-white/90 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">
                      Pilih Posisi / Titik Bordir ({Object.keys(selectedSpots).length} titik aktif)
                    </p>
                    <span className="text-xs font-bold text-emerald-800">
                      Total Titik: {formatIDR(embroideryCost)}
                    </span>
                  </div>

                  {/* Preset Spot Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {EMBROIDERY_PRESET_SPOTS.map((spot) => {
                      const isSelected = selectedSpots[spot] !== undefined;
                      return (
                        <button
                          key={spot}
                          type="button"
                          onClick={() => toggleSpot(spot)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                          }`}
                        >
                          {isSelected ? `✓ ${spot}` : `+ ${spot}`}
                        </button>
                      );
                    })}
                  </div>

                  {/* Spot Inputs if selected */}
                  {Object.keys(selectedSpots).length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-100">
                      {Object.entries(selectedSpots).map(([spot, cost]) => (
                        <div
                          key={spot}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-medium text-slate-800">{spot}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">Rp</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatIDRInput(cost)}
                              onChange={(e) => updateSpotCost(spot, e.target.value)}
                              className="w-24 rounded border border-slate-300 bg-white px-2 py-0.5 text-right text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => toggleSpot(spot)}
                              className="text-slate-400 hover:text-rose-600"
                              title="Hapus titik"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Total HPP & Subtotal Line */}
            <div className="mt-4 flex flex-col gap-2 border-t border-emerald-300 pt-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="text-xs text-emerald-950/80 space-y-0.5">
                <div>
                  <span>HPP Dasar: {formatIDR(baseHpp)}</span>
                  <span className="mx-1.5">+</span>
                  <span>Kain: {formatIDR(fabricCost)}</span>
                  {embroideryCost > 0 && (
                    <>
                      <span className="mx-1.5">+</span>
                      <span>Bordir: {formatIDR(embroideryCost)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  Estimasi Total HPP / Pcs
                </p>
                <p className="text-2xl font-bold tabular-nums text-emerald-950">
                  {formatIDR(simulatedHpp)}
                </p>
              </div>
            </div>

            {/* 3. Analisis Margin & Profitability vs Default Price */}
            <div className="mt-4 rounded-xl border border-emerald-300/80 bg-white/95 p-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">
                    Analisis Margin &amp; Profitabilitas (Berdasarkan Harga Standar)
                  </p>
                </div>
                {defaultPrice > 0 ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      marginPct >= 30
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : marginPct >= 15
                        ? "border border-amber-200 bg-amber-50 text-amber-700"
                        : marginPct >= 0
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : "border border-rose-300 bg-rose-100 text-rose-800"
                    }`}
                  >
                    {marginPct >= 30 ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    {marginPct >= 30
                      ? "Margin Sangat Sehat"
                      : marginPct >= 15
                      ? "Margin Standar"
                      : marginPct >= 0
                      ? "Margin Tipis"
                      : "Boncos / Rugi"}
                  </span>
                ) : null}
              </div>

              {defaultPrice > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase">Harga Standar</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                      {formatIDR(defaultPrice)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase">Total HPP</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                      {formatIDR(simulatedHpp)}
                    </p>
                  </div>
                  <div
                    className={`rounded-lg p-2.5 ${
                      profitPerPcs >= 0 ? "bg-emerald-50/70" : "bg-rose-50"
                    }`}
                  >
                    <p className="text-[10px] font-medium uppercase text-slate-600">Laba Bersih / Pcs</p>
                    <p
                      className={`mt-1 text-sm font-bold tabular-nums ${
                        profitPerPcs >= 0 ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {formatIDR(profitPerPcs)}
                    </p>
                  </div>
                  <div
                    className={`rounded-lg p-2.5 ${
                      marginPct >= 20 ? "bg-emerald-50/70" : "bg-amber-50"
                    }`}
                  >
                    <p className="text-[10px] font-medium uppercase text-slate-600">Margin / Markup</p>
                    <p
                      className={`mt-1 text-sm font-bold tabular-nums ${
                        marginPct >= 20 ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {marginPct}% <span className="text-xs font-normal text-slate-400">/ {markupPct}%</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-center py-2 text-xs text-muted-foreground">
                  Produk ini belum memiliki harga standar. Klik tombol <strong>Edit BOM</strong> di bawah untuk memasukkan harga jual patokan.
                </div>
              )}
            </div>
          </section>

          {/* Rincian Biaya Potong & Jahit */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Scissors className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Rincian HPP dasar</h3>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border">
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Biaya potong</span>
                <span className="font-medium tabular-nums">{formatIDR(cuttingCost)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Biaya jahit</span>
                <span className="font-medium tabular-nums">{formatIDR(sewingCost)}</span>
              </div>
              <div className="flex items-center justify-between bg-muted/30 px-4 py-3 text-sm">
                <span className="font-semibold text-foreground">Aksesoris / bahan fix</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatIDR(materialsCost)}
                </span>
              </div>
            </div>
          </section>

          {/* Kain yang digunakan */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Shirt className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Kain yang digunakan</h3>
                <p className="text-[11px] text-muted-foreground">
                  Jenis kain dipilih saat membuat order agar warna dan harga tersimpan sebagai snapshot.
                </p>
              </div>
            </div>
            {fabricSlots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                Produk ini tidak memiliki kebutuhan kain.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {fabricSlots.map((slot) => (
                  <div
                    key={slot.id || slot.label}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{slot.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {slot.material_categories?.name || "Semua kategori kain"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
                        {slot.usage_qty} {slot.unit}/pcs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bahan baku fix */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Bahan baku fix</h3>
            </div>
            {materials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                Belum ada aksesoris atau bahan fix.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="divide-y divide-border">
                  {materials.map((line) => {
                    const quantity = Number(line.quantity) || 0;
                    const price = Number(line.materials?.price) || 0;
                    return (
                      <div
                        key={line.material_id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {line.materials?.name || "Bahan"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {quantity} {line.materials?.unit || "unit"} × {formatIDR(price)}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatIDR(quantity * price)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={() => onEdit(product)}>
            <Pencil className="h-4 w-4" />
            Edit BOM
          </Button>
        </footer>
      </div>
    </div>
  );
}
