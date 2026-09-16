import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import MaterialColorsSection from "./MaterialColorsSection";
import { formatIDRInput, parseIDRInput } from "../../utils/formatCurrency";
import type { Material, MaterialCategory } from "../../types";

interface MaterialModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: Omit<Material, "id" | "material_categories">) => Promise<unknown>;
  editingMaterial: Material | null;
  categories: MaterialCategory[];
}

const COMMON_UNITS = ["meter", "yard", "pcs", "roll", "lusin", "set"];

export default function MaterialModal({
  open,
  onClose,
  onSubmit,
  editingMaterial,
  categories,
}: MaterialModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("meter");
  const [customUnit, setCustomUnit] = useState("");
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [price, setPrice] = useState("");
  const [composition, setComposition] = useState("");
  const [careInstruction, setCareInstruction] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isFabric = Boolean(selectedCategory?.is_fabric);

  useEffect(() => {
    if (!open) return;
    if (editingMaterial) {
      setCategoryId(editingMaterial.category_id || "");
      setName(editingMaterial.name || "");
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
      setPrice(formatIDRInput(editingMaterial.price || 0));
      setComposition(editingMaterial.composition || "");
      setCareInstruction(editingMaterial.care_instruction || "");
      setDescription(editingMaterial.description || "");
      setIsActive(editingMaterial.is_active ?? true);
    } else {
      const defaultCat = categories[0]?.id || "";
      setCategoryId(defaultCat);
      setName("");
      setUnit("meter");
      setIsCustomUnit(false);
      setCustomUnit("");
      setPrice("");
      setComposition("");
      setCareInstruction("");
      setDescription("");
      setIsActive(true);
    }
    setError("");
  }, [open, editingMaterial, categories]);

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

    const priceNum = parseIDRInput(price);
    if (priceNum < 0) {
      setError("Harga material tidak boleh negatif.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        category_id: categoryId || null,
        name: trimmedName,
        unit: finalUnit,
        price: priceNum,
        // If not fabric, ensure fabric-only fields are null
        composition: isFabric && composition.trim() ? composition.trim() : null,
        care_instruction: isFabric && careInstruction.trim() ? careInstruction.trim() : null,
        description: isFabric && description.trim() ? description.trim() : null,
        is_active: isActive,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan material.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {editingMaterial ? "Edit Material" : "Tambah Material Baru"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isFabric
                ? "Bahan kain (dengan spesifikasi & warna)"
                : "Aksesoris atau bahan baku non-kain"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Kategori & Status */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Kategori Material
              </span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Pilih Kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.is_fabric ? "(Kain)" : ""}
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

          {/* Nama Material */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              Nama Material
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Nagata Drill, Kancing Jamur 18L, Resleting YKK 50cm"
              className={inputClass}
              required
            />
          </label>

          {/* Satuan & Harga */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Satuan
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
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Harga Beli / Satuan (Rp)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(formatIDRInput(e.target.value))}
                placeholder="0"
                className={inputClass}
                required
              />
            </label>
          </div>

          {/* Field khusus kain jika kategori is_fabric === true */}
          {isFabric && (
            <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-50/30 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Spesifikasi Kain
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-emerald-950">
                  Komposisi Kain
                </span>
                <textarea
                  rows={2}
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
                <textarea
                  rows={2}
                  value={careInstruction}
                  onChange={(e) => setCareInstruction(e.target.value)}
                  placeholder="mis. Cuci dengan air dingin, jangan gunakan pemutih klorin, setrika suhu sedang"
                  className={inputClass}
                />
              </label>

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

          {/* Sub-section Warna jika kategori adalah kain */}
          {isFabric && (
            <MaterialColorsSection materialId={editingMaterial?.id} />
          )}

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
              {submitting ? "Menyimpan..." : editingMaterial ? "Simpan Perubahan" : "Tambah Material"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
