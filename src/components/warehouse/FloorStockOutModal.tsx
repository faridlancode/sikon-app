import { useState, useEffect, useMemo } from "react";
import { X, PackageOpen, AlertTriangle, ArrowRight, UserCheck, Layers } from "lucide-react";
import Button from "../ui/button";
import { inputClass } from "../ui/FormField";
import { supabase } from "../../lib/supabaseClient";
import type { Material, MaterialColor, Staff } from "../../types";

interface FloorStockOutModalProps {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  staffList: Staff[];
  onSubmit: (payload: {
    material_id: string;
    material_color_id?: string | null;
    qty: number;
    unit: string;
    taken_by?: string | null;
    recorded_by?: string | null;
    notes?: string;
  }) => Promise<void>;
}

export default function FloorStockOutModal({
  open,
  onClose,
  materials,
  staffList,
  onSubmit,
}: FloorStockOutModalProps) {
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [colors, setColors] = useState<MaterialColor[]>([]);
  const [loadingColors, setLoadingColors] = useState(false);

  // Input qty: bisa input kemasan atau base unit
  const [inputMode, setInputMode] = useState<"package" | "base">("package");
  const [packageQty, setPackageQty] = useState<string>("1");
  const [baseQty, setBaseQty] = useState<string>("");

  const [takenBy, setTakenBy] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [notes, setNotes] = useState("Floor Stock — Operasional Meja Jahit");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedMaterialId),
    [materials, selectedMaterialId]
  );

  const isFabric = Boolean(selectedMaterial?.material_categories?.is_fabric);
  const hasPurchaseUnit = Boolean(
    selectedMaterial?.purchase_unit && Number(selectedMaterial.conversion_rate) > 1
  );
  const conversionRate = Number(selectedMaterial?.conversion_rate) || 1;

  // Staf groups
  const sewingStaff = useMemo(
    () => staffList.filter((s) => s.role === "Penjahit"),
    [staffList]
  );
  const gudangStaff = useMemo(
    () => staffList.filter((s) => s.role === "Gudang"),
    [staffList]
  );

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setError("");
    const nonFabric = materials.find((m) => !m.material_categories?.is_fabric);
    const initialMat = nonFabric || materials[0];
    const initialMatId = initialMat?.id || "";
    setSelectedMaterialId(initialMatId);
    setSelectedColorId("");
    setInputMode(
      initialMat?.purchase_unit && Number(initialMat.conversion_rate) > 1
        ? "package"
        : "base"
    );
    setPackageQty("1");
    setBaseQty(
      initialMat?.purchase_unit && Number(initialMat.conversion_rate) > 1
        ? String(Number(initialMat.conversion_rate))
        : "1"
    );
    setTakenBy(sewingStaff[0]?.id || staffList[0]?.id || "");
    setRecordedBy(gudangStaff[0]?.id || staffList[0]?.id || "");
    setNotes("Floor Stock — Operasional Meja Jahit");
  }, [open, materials, sewingStaff, gudangStaff, staffList]);

  // Fetch colors if selected material changes
  useEffect(() => {
    if (!selectedMaterialId) {
      setColors([]);
      return;
    }

    let active = true;
    setLoadingColors(true);
    supabase
      .from("material_colors")
      .select("*")
      .eq("material_id", selectedMaterialId)
      .eq("is_active", true)
      .order("color_name", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          setColors(data);
          if (data.length > 0) {
            setSelectedColorId(data[0].id);
          } else {
            setSelectedColorId("");
          }
        } else {
          setColors([]);
          setSelectedColorId("");
        }
        setLoadingColors(false);
      });

    return () => {
      active = false;
    };
  }, [selectedMaterialId]);

  // Calculate actual base quantity to deduct
  const effectiveBaseQty = useMemo(() => {
    if (inputMode === "package" && hasPurchaseUnit) {
      const pQty = Number(packageQty) || 0;
      return pQty * conversionRate;
    }
    return Number(baseQty) || 0;
  }, [inputMode, hasPurchaseUnit, packageQty, conversionRate, baseQty]);

  // Determine current available stock
  const currentStock = useMemo(() => {
    if (!selectedMaterial) return 0;
    if (selectedColorId) {
      const c = colors.find((col) => col.id === selectedColorId);
      return Number(c?.stock_qty) || 0;
    }
    return Number(selectedMaterial.stock_qty) || 0;
  }, [selectedMaterial, selectedColorId, colors]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedMaterial) {
      setError("Pilih material terlebih dahulu.");
      return;
    }

    if (effectiveBaseQty <= 0) {
      setError("Jumlah pengeluaran harus lebih dari 0.");
      return;
    }

    if (effectiveBaseQty > currentStock) {
      setError(
        `Stok tidak mencukupi! Stok saat ini: ${currentStock.toLocaleString("id-ID")} ${
          selectedMaterial.unit
        }, pengeluaran: ${effectiveBaseQty.toLocaleString("id-ID")} ${
          selectedMaterial.unit
        }.`
      );
      return;
    }

    if (!takenBy) {
      setError("Pilih staf penerima barang.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        material_id: selectedMaterial.id,
        material_color_id: selectedColorId || null,
        qty: effectiveBaseQty,
        unit: selectedMaterial.unit,
        taken_by: takenBy || null,
        recorded_by: recordedBy || null,
        notes: notes.trim() || "Floor Stock — Operasional Meja Jahit",
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal mencatat pengeluaran barang.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <PackageOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Pengeluaran Floor Stock (Operasional)
              </h2>
              <p className="text-xs text-muted-foreground">
                Serahkan benang, kancing, jarum, atau consumables ke meja kerja staf/penjahit
              </p>
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

          {/* Pilih Material */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Pilih Material / Item <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedMaterialId}
              onChange={(e) => {
                setSelectedMaterialId(e.target.value);
                const mat = materials.find((m) => m.id === e.target.value);
                if (mat?.purchase_unit && Number(mat.conversion_rate) > 1) {
                  setInputMode("package");
                  setPackageQty("1");
                  setBaseQty(String(mat.conversion_rate));
                } else {
                  setInputMode("base");
                  setBaseQty("1");
                }
              }}
              className={inputClass}
              required
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.brand ? `(${m.brand})` : ""} — Stok: {m.stock_qty || 0} {m.unit}
                </option>
              ))}
            </select>
          </div>

          {/* Varian Warna (jika ada) */}
          {colors.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Varian Warna <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedColorId}
                onChange={(e) => setSelectedColorId(e.target.value)}
                className={inputClass}
                disabled={loadingColors}
                required
              >
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.color_name} — Stok: {c.stock_qty || 0} {selectedMaterial?.unit}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Info Stok Tersedia */}
          <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground">Stok Fisik Tersedia di Gudang:</span>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {currentStock.toLocaleString("id-ID")} {selectedMaterial?.unit}
              </p>
            </div>
            {hasPurchaseUnit && (
              <span className="text-[11px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                1 {selectedMaterial?.purchase_unit} = {conversionRate} {selectedMaterial?.unit}
              </span>
            )}
          </div>

          {/* Input Jumlah Pengeluaran */}
          <div className="space-y-2 rounded-xl border border-border p-3.5 bg-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Jumlah Barang Keluar <span className="text-rose-500">*</span>
              </span>
              {hasPurchaseUnit && (
                <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[11px]">
                  <button
                    type="button"
                    onClick={() => setInputMode("package")}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      inputMode === "package"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Satuan Beli ({selectedMaterial?.purchase_unit})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode("base");
                      setBaseQty(String(effectiveBaseQty || 1));
                    }}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      inputMode === "base"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Satuan Stok ({selectedMaterial?.unit})
                  </button>
                </div>
              )}
            </div>

            {inputMode === "package" && hasPurchaseUnit ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={packageQty}
                    onChange={(e) => setPackageQty(e.target.value)}
                    placeholder="1"
                    className={`${inputClass} font-bold text-sm`}
                    required
                  />
                  <span className="text-xs font-medium text-foreground shrink-0 capitalize">
                    {selectedMaterial?.purchase_unit}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                  <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                  <span>
                    Stok gudang akan terpotong:{" "}
                    <strong className="text-primary font-bold">
                      {effectiveBaseQty.toLocaleString("id-ID")} {selectedMaterial?.unit}
                    </strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={baseQty}
                  onChange={(e) => setBaseQty(e.target.value)}
                  placeholder="0"
                  className={`${inputClass} font-bold text-sm`}
                  required
                />
                <span className="text-xs font-medium text-foreground shrink-0">
                  {selectedMaterial?.unit}
                </span>
              </div>
            )}

            {/* Sisa Stok Estimasi */}
            <div className="flex justify-between items-center pt-2 text-[11px] border-t border-border text-muted-foreground">
              <span>Sisa stok setelah pengeluaran:</span>
              <span
                className={`font-semibold ${
                  currentStock - effectiveBaseQty < 0
                    ? "text-rose-600"
                    : "text-emerald-700"
                }`}
              >
                {(currentStock - effectiveBaseQty).toLocaleString("id-ID")}{" "}
                {selectedMaterial?.unit}
              </span>
            </div>
          </div>

          {/* Staf Penerima & Gudang */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Diterima Oleh (Penjahit/Staf) <span className="text-rose-500">*</span>
              </label>
              <select
                value={takenBy}
                onChange={(e) => setTakenBy(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">-- Pilih Staf Penerima --</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.role ? `(${s.role})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Diserahkan Oleh (Gudang)
              </label>
              <select
                value={recordedBy}
                onChange={(e) => setRecordedBy(e.target.value)}
                className={inputClass}
              >
                <option value="">-- Pilih Staf Gudang --</option>
                {gudangStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Catatan / Keterangan */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Catatan / Keperluan
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. Benang jahit meja lini 1, kancing kemeja batch 2"
              className={inputClass}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting || effectiveBaseQty <= 0 || effectiveBaseQty > currentStock}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <PackageOpen className="h-4 w-4" />
              {submitting ? "Memproses..." : "Keluarkan Barang"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
