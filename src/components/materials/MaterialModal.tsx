import { useEffect, useState } from "react";
import { X, Sparkles, Layers, Package, HelpCircle } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import MaterialColorsSection, { type StagedColor } from "./MaterialColorsSection";
import MaterialPurchaseUnitsEditor from "./MaterialPurchaseUnitsEditor";
import {
  formatIDR,
  formatIDRInput,
  parseIDRInput,
  parseDecimalInput,
  formatPurchaseUnit,
} from "../../utils/formatCurrency";
import type { Material, MaterialCategory, MaterialPurchaseUnit } from "../../types";
import { getMaterialPurchaseUnits, getPrimaryPurchaseUnit } from "../../utils/materialUnits";

interface MaterialModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    payload: Omit<Material, "id" | "material_categories">,
    stagedColors?: StagedColor[]
  ) => Promise<unknown>;
  editingMaterial: Material | null;
  categories: MaterialCategory[];
}

const COMMON_UNITS = ["meter", "yard", "pcs", "roll", "lusin", "set", "kg"];

export default function MaterialModal({
  open,
  onClose,
  onSubmit,
  editingMaterial,
  categories,
}: MaterialModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("meter");
  const [customUnit, setCustomUnit] = useState("");
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [purchaseUnits, setPurchaseUnits] = useState<MaterialPurchaseUnit[]>([]);

  // Dual pricing state with 2-way sync
  const [stockPrice, setStockPrice] = useState(""); // Harga per Base Unit (bisa desimal 2 angka)
  const [purchasePrice, setPurchasePrice] = useState(""); // Harga per Kemasan Grosir (tanpa pembulatan aneh)
  const [lastEditedField, setLastEditedField] = useState<"purchase" | "stock">("purchase");

  const [composition, setComposition] = useState("");
  const [careInstruction, setCareInstruction] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Staged colors for new materials
  const [stagedColors, setStagedColors] = useState<StagedColor[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isFabric = Boolean(selectedCategory?.is_fabric);
  const activeUnit = isCustomUnit ? (customUnit.trim() || "unit") : unit;
  const primaryPurchaseUnit = getPrimaryPurchaseUnit(purchaseUnits);
  const primaryRate = Number(primaryPurchaseUnit?.conversion_rate) || 1;
  const primaryUnitName = primaryPurchaseUnit?.name || "";
  const hasPrimaryFixedConversion = Boolean(primaryPurchaseUnit && !primaryPurchaseUnit.is_variable);
  const hasMultiUom = Boolean(primaryUnitName && primaryUnitName !== activeUnit);

  useEffect(() => {
    if (!open) return;
    if (editingMaterial) {
      setCategoryId(editingMaterial.category_id || "");
      setName(editingMaterial.name || "");
      setBrand(editingMaterial.brand || "");
      const existingUnit = editingMaterial.unit || "meter";
      if (COMMON_UNITS.includes(existingUnit)) {
        setUnit(existingUnit);
        setIsCustomUnit(false);
        setCustomUnit("");
      } else {
        setUnit("custom");
        setIsCustomUnit(true);
        setCustomUnit(existingUnit);
      }
      setPurchaseUnits(getMaterialPurchaseUnits(editingMaterial).filter((u) => u.id !== "base-unit"));
      const cRate = Number(editingMaterial.conversion_rate) || 1;

      const basePriceNum = Number(editingMaterial.price) || 0;
      setStockPrice(basePriceNum > 0 ? formatIDR(basePriceNum) : "");
      setPurchasePrice(
        basePriceNum > 0 ? formatIDRInput(Math.round(basePriceNum * cRate)) : ""
      );
      setLastEditedField("purchase");

      setComposition(editingMaterial.composition || "");
      setCareInstruction(editingMaterial.care_instruction || "");
      setDescription(editingMaterial.description || "");
      setIsActive(editingMaterial.is_active ?? true);
      setStagedColors([]);
    } else {
      const defaultCat = categories[0]?.id || "";
      const defaultIsFabric = Boolean(categories[0]?.is_fabric);
      setCategoryId(defaultCat);
      setName("");
      setBrand("");
      setUnit(defaultIsFabric ? "meter" : "pcs");
      setIsCustomUnit(false);
      setCustomUnit("");
      setPurchaseUnits([]);
      setStockPrice("");
      setPurchasePrice("");
      setLastEditedField("purchase");
      setComposition("");
      setCareInstruction("");
      setDescription("");
      setIsActive(true);
      setStagedColors([]);
    }
    setError("");
  }, [open, editingMaterial, categories]);

  // Two-way price synchronization handlers
  function handlePurchasePriceChange(rawVal: string) {
    setLastEditedField("purchase");
    const pNum = parseIDRInput(rawVal);
    setPurchasePrice(pNum > 0 ? formatIDRInput(pNum) : "");
    const rate = primaryRate;
    if (rate > 0) {
      if (pNum > 0) {
        // Desimal 2 angka di belakang koma untuk harga pokok satuan stok
        const calculatedBase = pNum / rate;
        setStockPrice(formatIDR(calculatedBase));
      } else {
        setStockPrice("");
      }
    }
  }

  function handleStockPriceChange(rawVal: string) {
    setLastEditedField("stock");
    setStockPrice(rawVal);
    const sNum = parseDecimalInput(rawVal);
    const rate = primaryRate;
    if (rate > 0 && sNum > 0) {
      const calculatedPurchase = Math.round(sNum * rate);
      setPurchasePrice(calculatedPurchase > 0 ? formatIDRInput(calculatedPurchase) : "");
    } else if (!rawVal) {
      setPurchasePrice("");
    }
  }

  function handleStockPriceBlur() {
    const sNum = parseDecimalInput(stockPrice);
    if (sNum > 0) {
      setStockPrice(formatIDR(sNum));
    } else {
      setStockPrice("");
    }
  }

  function handlePurchaseUnitsChange(nextUnits: MaterialPurchaseUnit[]) {
    setPurchaseUnits(nextUnits);
    const primary = getPrimaryPurchaseUnit(nextUnits);
    const rate = Number(primary?.conversion_rate) || 1;
    const pNum = parseIDRInput(purchasePrice);
    if (pNum > 0 && primary && !primary.is_variable && rate > 0) {
      setStockPrice(formatIDR(pNum / rate));
    }
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama material wajib diisi.");
      return;
    }

    const finalUnit = isCustomUnit ? customUnit.trim() : unit;
    if (!finalUnit) {
      setError("Satuan material wajib diisi.");
      return;
    }

    const normalizedUnitNames = purchaseUnits.map((purchaseUnit) => purchaseUnit.name.trim().toLowerCase());
    if (
      normalizedUnitNames.some((purchaseUnitName) => !purchaseUnitName || purchaseUnitName === finalUnit.toLowerCase()) ||
      new Set(normalizedUnitNames).size !== normalizedUnitNames.length
    ) {
      setError("Nama satuan beli wajib diisi, berbeda dari satuan stok, dan tidak boleh duplikat.");
      return;
    }
    if (purchaseUnits.some((purchaseUnit) => !purchaseUnit.is_variable && Number(purchaseUnit.conversion_rate) <= 0)) {
      setError("Rasio konversi satuan tetap harus lebih besar dari 0.");
      return;
    }
    if (purchaseUnits.length > 0 && purchaseUnits.filter((purchaseUnit) => purchaseUnit.is_primary).length !== 1) {
      setError("Pilih tepat satu satuan beli utama.");
      return;
    }

    const rateNum = primaryRate;

    const pNum = parseIDRInput(purchasePrice);
    const sNum = parseDecimalInput(stockPrice);
    let priceNum = 0;

    if (hasMultiUom && hasPrimaryFixedConversion && rateNum > 1) {
      if (lastEditedField === "purchase" && pNum > 0) {
        // Simpan rasio presisi agar saat dikalikan rate menghasilkan pNum yang tepat (misal 20.000)
        priceNum = pNum / rateNum;
      } else if (sNum > 0) {
        priceNum = sNum;
      }
    } else {
      priceNum = sNum;
    }

    if (priceNum < 0) {
      setError("Harga material tidak boleh negatif.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(
        {
          category_id: categoryId || null,
          name: trimmedName,
          brand: brand.trim() || null,
          unit: finalUnit,
          purchase_unit: primaryUnitName.trim() || null,
          conversion_rate: rateNum > 0 ? rateNum : 1,
          purchase_units: purchaseUnits,
          price: priceNum,
          // If not fabric, ensure fabric-only fields are null
          composition: isFabric && composition.trim() ? composition.trim() : null,
          care_instruction: isFabric && careInstruction.trim() ? careInstruction.trim() : null,
          description: isFabric && description.trim() ? description.trim() : null,
          is_active: isActive,
        },
        editingMaterial ? undefined : stagedColors
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan material.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {editingMaterial ? "Edit Data Material" : "Tambah Material Baru"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isFabric
                  ? "Bahan kain konveksi (spesifikasi tekstil & varian warna)"
                  : "Aksesoris, benang, & bahan baku konveksi (multi-kemasan & varian warna)"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Section 1: Identitas & Kategori */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Kategori Material <span className="text-rose-500">*</span>
                </span>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    const newCatId = e.target.value;
                    setCategoryId(newCatId);
                    const cat = categories.find((c) => c.id === newCatId);
                    if (cat?.is_fabric && unit === "pcs") {
                      setUnit("meter");
                    } else if (!cat?.is_fabric && unit === "meter") {
                      setUnit("pcs");
                    }
                  }}
                  className={inputClass}
                  required
                >
                  <option value="">-- Pilih Kategori --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.is_fabric ? "(Kain)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Status Master Data
                </span>
                <select
                  value={isActive ? "active" : "inactive"}
                  onChange={(e) => setIsActive(e.target.value === "active")}
                  className={inputClass}
                >
                  <option value="active">Aktif (Dapat Digunakan)</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Nama Material <span className="text-rose-500">*</span>
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="mis. Katun Combed 30s, Kancing Kemeja 18L, Sleting Besi No.5, Benang Jahit 40/2"
                    className={inputClass}
                    required
                  />
                </label>
              </div>

              <div className="sm:col-span-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Merk / Brand
                  </span>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="mis. YKK, Astra, Tulip"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Satuan & Konversi Kemasan Grosir (Multi-UOM) */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Layers className="h-4 w-4 text-primary" />
              <span>Satuan Inventori & Kemasan Beli Grosir (Multi-UOM)</span>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {/* Satuan Stok / Base Unit */}
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Satuan Pemakaian / Stok (Base Unit) <span className="text-rose-500">*</span>
                  </span>
                  <div className="flex gap-2">
                    <select
                      value={isCustomUnit ? "custom" : unit}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setIsCustomUnit(true);
                        } else {
                          setIsCustomUnit(false);
                          setUnit(e.target.value);
                        }
                      }}
                      className={`${inputClass} ${isCustomUnit ? "w-1/2" : "w-full"}`}
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      <option value="custom">Lainnya...</option>
                    </select>
                    {isCustomUnit && (
                      <input
                        type="text"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Satuan baru"
                        className={`${inputClass} w-1/2`}
                        required
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Satuan terkecil di gudang &amp; dasar hitung HPP per pcs baju.
                  </p>
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-card p-3.5">
              <MaterialPurchaseUnitsEditor
                baseUnit={activeUnit}
                units={purchaseUnits}
                onChange={handlePurchaseUnitsChange}
              />
            </div>
          </div>

          {/* Section 3: Input Harga Terintegrasi (Two-Way Sync) */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Penetapan Harga Beli &amp; Harga Pokok
              </span>
            </div>

            {hasMultiUom && hasPrimaryFixedConversion && primaryRate > 1 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {/* Harga Beli Supplier per Kemasan */}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-primary">
                      Harga Beli per 1 {formatPurchaseUnit(primaryUnitName)} (Rp)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={purchasePrice}
                      onChange={(e) => handlePurchasePriceChange(e.target.value)}
                      placeholder="mis. 20.000"
                      className={`${inputClass} border-primary/40 focus:border-primary font-medium`}
                    />
                    <span className="mt-1 text-[11px] text-muted-foreground block">
                      Harga beli dari supplier per 1 {formatPurchaseUnit(primaryUnitName)}
                    </span>
                  </label>

                  {/* Harga Pokok per Base Unit (Terkalkulasi Otomatis dengan 2 desimal) */}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-foreground">
                      Harga Pokok per Satuan Stok ({activeUnit}) <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={stockPrice}
                      onChange={(e) => handleStockPriceChange(e.target.value)}
                      onBlur={handleStockPriceBlur}
                      placeholder="mis. 2,86"
                      className={inputClass}
                      required
                    />
                    <span className="mt-1 text-[11px] text-muted-foreground block">
                      = {purchasePrice || "Rp 0"} ÷ {primaryRate} {activeUnit} = {stockPrice || "Rp 0"} / {activeUnit}
                    </span>
                  </label>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 px-3.5 py-2 text-xs text-primary flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                  <span>
                    💡 <strong>Sinkronisasi Otomatis:</strong> Harga pokok per {activeUnit} dihitung dengan 2 angka di belakang koma (misal Rp 2,86/meter). Anda juga bisa mengubah langsung salah satu harga di atas.
                  </span>
                </div>
              </div>
            ) : (
              <label className="block max-w-sm">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Harga Pembelian / Pokok Satuan (Rp / {activeUnit}) <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  value={stockPrice}
                  onChange={(e) => handleStockPriceChange(e.target.value)}
                  onBlur={handleStockPriceBlur}
                  placeholder="mis. 15.000"
                  className={inputClass}
                  required
                />
                <span className="mt-1 text-[11px] text-muted-foreground block">
                  Harga per 1 {activeUnit} untuk perhitungan HPP &amp; pengadaan gudang.
                </span>
              </label>
            )}
          </div>

          {/* Section 4: Spesifikasi Khusus Kain (Komposisi & Perawatan) */}
          {isFabric && (
            <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Spesifikasi Tekstil Kain
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-emerald-950">
                    Komposisi Kain
                  </span>
                  <input
                    type="text"
                    value={composition}
                    onChange={(e) => setComposition(e.target.value)}
                    placeholder="mis. 65% Katun, 35% Poliester"
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-emerald-950">
                    Instruksi Perawatan
                  </span>
                  <input
                    type="text"
                    value={careInstruction}
                    onChange={(e) => setCareInstruction(e.target.value)}
                    placeholder="mis. Cuci suhu dingin, setrika sedang"
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-emerald-950">
                  Deskripsi / Spesifikasi Tambahan
                </span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="mis. Lebar kain 150cm, gramasi 210 gsm, tekstur serat twill tebal"
                  className={inputClass}
                />
              </label>
            </div>
          )}

          {/* Section 5: Variasi Warna Material (SEMUA MATERIAL: Kain, Kancing, Sleting, Benang, dll) */}
          <MaterialColorsSection
            materialId={editingMaterial?.id}
            stagedColors={stagedColors}
            onStagedColorsChange={setStagedColors}
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting
                ? "Menyimpan..."
                : editingMaterial
                  ? "Simpan Perubahan"
                  : `Tambah Material ${stagedColors.length > 0 ? `(${stagedColors.length} Warna)` : ""}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
