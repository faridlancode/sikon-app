import { useEffect, useState } from "react";
import { X, Plus, Trash2, Layers, Package, Scissors, Shirt } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import { formatIDR, formatIDRInput, parseIDRInput } from "../../utils/formatCurrency";
import type {
  Product,
  ProductCategory,
  MaterialCategory,
  Material,
  ProductMaterialLine,
  ProductFabricSlot,
} from "../../types";

interface DynamicMaterialRow extends ProductMaterialLine {
  key: string;
}

interface DynamicSlotRow extends ProductFabricSlot {
  key: string;
}

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    product: Omit<Product, "id" | "product_categories">;
    materials: ProductMaterialLine[];
    fabricSlots: ProductFabricSlot[];
  }) => Promise<unknown>;
  editingProduct: Product | null;
  productCategories: ProductCategory[];
  materialCategories: MaterialCategory[];
  allMaterials: Material[];
  fetchProductBom?: (productId: string) => Promise<{
    materials: (ProductMaterialLine & { materials?: { name: string; unit: string; price: number } })[];
    fabricSlots: ProductFabricSlot[];
  }>;
}

export default function ProductModal({
  open,
  onClose,
  onSubmit,
  editingProduct,
  productCategories,
  materialCategories,
  allMaterials,
  fetchProductBom,
}: ProductModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sewingCost, setSewingCost] = useState("");
  const [cuttingCost, setCuttingCost] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [materialLines, setMaterialLines] = useState<DynamicMaterialRow[]>([]);
  const [fabricSlots, setFabricSlots] = useState<DynamicSlotRow[]>([]);

  const [loadingBom, setLoadingBom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Filter materials: only non-fabric for BOM fixed accessories
  const nonFabricMaterials = allMaterials.filter(
    (m) => !m.material_categories?.is_fabric
  );

  // Filter categories: only fabric categories for fabric slots
  const fabricCategories = materialCategories.filter((c) => c.is_fabric);

  // Map for quick material lookup
  const materialMap = new Map(allMaterials.map((m) => [m.id, m]));

  useEffect(() => {
    if (!open) return;
    setError("");

    if (editingProduct) {
      setCategoryId(editingProduct.category_id || "");
      setName(editingProduct.name || "");
      setDescription(editingProduct.description || "");
      setSewingCost(formatIDRInput(editingProduct.sewing_cost_per_pcs || 0));
      setCuttingCost(formatIDRInput(editingProduct.cutting_cost_per_pcs || 0));
      setIsActive(editingProduct.is_active ?? true);

      // Load BOM details
      if (fetchProductBom) {
        setLoadingBom(true);
        fetchProductBom(editingProduct.id)
          .then((bom) => {
            setMaterialLines(
              bom.materials.map((m) => ({
                key: crypto.randomUUID(),
                material_id: m.material_id,
                quantity: m.quantity,
              }))
            );
            setFabricSlots(
              bom.fabricSlots.map((s) => ({
                key: crypto.randomUUID(),
                fabric_category_id: s.fabric_category_id || null,
                label: s.label || "Kain Utama",
                usage_qty: s.usage_qty,
                unit: s.unit || "meter",
              }))
            );
          })
          .catch((err) => {
            console.error("Gagal memuat BOM produk:", err);
          })
          .finally(() => setLoadingBom(false));
      } else {
        setMaterialLines([]);
        setFabricSlots([]);
      }
    } else {
      setCategoryId(productCategories[0]?.id || "");
      setName("");
      setDescription("");
      setSewingCost("");
      setCuttingCost("");
      setIsActive(true);
      setMaterialLines([]);
      setFabricSlots([
        {
          key: crypto.randomUUID(),
          fabric_category_id: fabricCategories[0]?.id || null,
          label: "Kain Utama",
          usage_qty: 1.5,
          unit: "meter",
        },
      ]);
    }
  }, [open, editingProduct]);

  if (!open) return null;

  // Add & remove accessories line
  function addMaterialLine() {
    const firstNonFabric = nonFabricMaterials[0]?.id || "";
    setMaterialLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), material_id: firstNonFabric, quantity: 1 },
    ]);
  }

  function updateMaterialLine(key: string, patch: Partial<DynamicMaterialRow>) {
    setMaterialLines((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function removeMaterialLine(key: string) {
    setMaterialLines((prev) => prev.filter((item) => item.key !== key));
  }

  // Add & remove fabric slot
  function addFabricSlot() {
    setFabricSlots((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        fabric_category_id: fabricCategories[0]?.id || null,
        label: prev.length === 0 ? "Kain Utama" : `Kain ${prev.length + 1}`,
        usage_qty: 1.5,
        unit: "meter",
      },
    ]);
  }

  function updateFabricSlot(key: string, patch: Partial<DynamicSlotRow>) {
    setFabricSlots((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function removeFabricSlot(key: string) {
    setFabricSlots((prev) => prev.filter((item) => item.key !== key));
  }

  // Live calculation: HPP (tanpa kain)
  const sewingNum = parseIDRInput(sewingCost);
  const cuttingNum = parseIDRInput(cuttingCost);
  const fixedMaterialsCost = materialLines.reduce((sum, line) => {
    const mat = materialMap.get(line.material_id);
    const price = mat?.price || 0;
    return sum + (Number(line.quantity) || 0) * price;
  }, 0);

  const estimatedHppNoFabric = sewingNum + cuttingNum + fixedMaterialsCost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama produk wajib diisi.");
      return;
    }

    // Validate material lines
    for (const m of materialLines) {
      if (!m.material_id) {
        setError("Pilih material pada setiap baris bahan baku fix.");
        return;
      }
      if (Number(m.quantity) <= 0) {
        setError("Jumlah pemakaian bahan baku fix harus lebih dari 0.");
        return;
      }
    }

    // Validate fabric slots
    for (const s of fabricSlots) {
      if (!s.label.trim()) {
        setError("Label slot kain wajib diisi (mis. Kain Utama, Lining).");
        return;
      }
      if (Number(s.usage_qty) <= 0) {
        setError("Kebutuhan kain pada setiap slot harus lebih dari 0.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        product: {
          category_id: categoryId || null,
          name: trimmedName,
          description: description.trim() || null,
          sewing_cost_per_pcs: sewingNum,
          cutting_cost_per_pcs: cuttingNum,
          is_active: isActive,
        },
        materials: materialLines.map((m) => ({
          material_id: m.material_id,
          quantity: Number(m.quantity),
        })),
        fabricSlots: fabricSlots.map((s) => ({
          fabric_category_id: s.fabric_category_id || null,
          label: s.label.trim(),
          usage_qty: Number(s.usage_qty),
          unit: s.unit || "meter",
        })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Shirt className="h-4 w-4 text-primary" />
              {editingProduct ? "Edit Resep / BOM Product" : "Tambah Product Baru (BOM)"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Tentukan komposisi biaya dan kebutuhan bahan baku untuk model produk ini.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Section 1: Info Dasar */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border pb-2">
              <Layers className="h-3.5 w-3.5 text-primary" />
              1. Informasi Dasar Produk
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Kategori Produk
                </span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Tanpa Kategori</option>
                  {productCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Status
                </span>
                <select
                  value={isActive ? "active" : "inactive"}
                  onChange={(e) => setIsActive(e.target.value === "active")}
                  className={inputClass}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Nama Produk / Model
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Kemeja Tactical PDL Lengan Panjang, Rompi Safety"
                className={inputClass}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Deskripsi
              </span>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Spesifikasi model produk, detail pola..."
                className={inputClass}
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground flex items-center gap-1">
                  <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
                  Biaya Potong per pcs (Rp)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cuttingCost}
                  onChange={(e) => setCuttingCost(formatIDRInput(e.target.value))}
                  placeholder="0"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground flex items-center gap-1">
                  <Shirt className="h-3.5 w-3.5 text-muted-foreground" />
                  Biaya Jahit per pcs (Rp)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sewingCost}
                  onChange={(e) => setSewingCost(formatIDRInput(e.target.value))}
                  placeholder="0"
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          {/* Section 2: BOM Aksesoris / Fix */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-primary" />
                2. Bahan Baku Fix (Aksesoris, Kancing, dll)
              </h3>
              <Button type="button" size="sm" variant="outline" onClick={addMaterialLine}>
                <Plus className="h-3.5 w-3.5" />
                Tambah Bahan
              </Button>
            </div>

            {loadingBom ? (
              <p className="text-xs text-muted-foreground py-2">Memuat data BOM...</p>
            ) : materialLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Belum ada aksesoris fix (kancing, benang, velcro, dll). Klik &ldquo;Tambah Bahan&rdquo; jika ada.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {materialLines.map((line) => {
                  const currentMat = materialMap.get(line.material_id);
                  const price = currentMat?.price || 0;
                  const unitLabel = currentMat?.unit || "pcs";
                  const lineTotal = (Number(line.quantity) || 0) * price;

                  return (
                    <div
                      key={line.key}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1">
                        <select
                          value={line.material_id}
                          onChange={(e) => updateMaterialLine(line.key, { material_id: e.target.value })}
                          className={`${inputClass} text-xs py-1.5 h-9`}
                        >
                          <option value="">Pilih Aksesoris / Bahan</option>
                          {nonFabricMaterials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({formatIDR(m.price)} / {m.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => updateMaterialLine(line.key, { quantity: Number(e.target.value) })}
                            placeholder="Qty"
                            className={`${inputClass} w-24 text-xs py-1.5 h-9`}
                          />
                          <span className="text-xs text-muted-foreground font-mono w-10">
                            {unitLabel}
                          </span>
                        </div>

                        <div className="w-28 text-right tabular-nums text-xs font-medium text-foreground">
                          {formatIDR(lineTotal)}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeMaterialLine(line.key)}
                          className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Slot Kain */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shirt className="h-3.5 w-3.5 text-primary" />
                  3. Kebutuhan Kain (Slot)
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tentukan perkiraan kebutuhan kain (pilihan jenis & warna kain dilakukan saat input pesanan).
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addFabricSlot}>
                <Plus className="h-3.5 w-3.5" />
                Tambah Slot Kain
              </Button>
            </div>

            {fabricSlots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Produk ini tidak membutuhkan kain (misal produk aksesoris murni).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {fabricSlots.map((slot) => (
                  <div
                    key={slot.key}
                    className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-card p-3 sm:items-center"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <input
                        type="text"
                        value={slot.label}
                        onChange={(e) => updateFabricSlot(slot.key, { label: e.target.value })}
                        placeholder="Label slot (mis. Kain Utama, Furing)"
                        className={`${inputClass} text-xs py-1.5 h-9`}
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-4">
                      <select
                        value={slot.fabric_category_id || ""}
                        onChange={(e) => updateFabricSlot(slot.key, { fabric_category_id: e.target.value || null })}
                        className={`${inputClass} text-xs py-1.5 h-9`}
                      >
                        <option value="">Semua Kategori Kain</option>
                        {fabricCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-6 sm:col-span-2">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={slot.usage_qty}
                        onChange={(e) => updateFabricSlot(slot.key, { usage_qty: Number(e.target.value) })}
                        placeholder="Qty"
                        className={`${inputClass} text-xs py-1.5 h-9`}
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-1">
                      <select
                        value={slot.unit}
                        onChange={(e) => updateFabricSlot(slot.key, { unit: e.target.value })}
                        className={`${inputClass} text-xs py-1.5 h-9 px-1`}
                      >
                        <option value="meter">m</option>
                        <option value="yard">yd</option>
                      </select>
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeFabricSlot(slot.key)}
                        className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        title="Hapus slot"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Card: Estimasi HPP */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Estimasi HPP Dasar (Tanpa Kain)
                </p>
                <p className="text-xs text-muted-foreground">
                  *Belum termasuk kain — kain dipilih saat membuat order.
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {formatIDR(estimatedHppNoFabric)}
                </span>
                <span className="text-xs text-muted-foreground"> / pcs</span>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-primary/10 pt-2 text-xs text-muted-foreground">
              <span>Potong: {formatIDR(cuttingNum)}</span>
              <span>·</span>
              <span>Jahit: {formatIDR(sewingNum)}</span>
              <span>·</span>
              <span>Bahan Fix: {formatIDR(fixedMaterialsCost)}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Menyimpan..." : editingProduct ? "Simpan Perubahan" : "Buat Product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
