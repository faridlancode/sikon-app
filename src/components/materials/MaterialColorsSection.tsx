import { useState } from "react";
import { Plus, Trash2, Palette, AlertCircle } from "lucide-react";
import { useMaterialColors } from "../../hooks/useMaterialColors";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";

interface MaterialColorsSectionProps {
  materialId?: string | null;
}

export default function MaterialColorsSection({ materialId }: MaterialColorsSectionProps) {
  const { colors, loading, error, addColor, deleteColor } = useMaterialColors(materialId);
  const [colorName, setColorName] = useState("");
  const [colorCode, setColorCode] = useState("#2563eb");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  if (!materialId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
        <AlertCircle className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-1 text-xs text-muted-foreground">
          Simpan material dulu untuk dapat menambahkan varian warna kain.
        </p>
      </div>
    );
  }

  async function handleAddColor(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = colorName.trim();
    if (!trimmed) {
      setLocalError("Nama warna wajib diisi.");
      return;
    }

    setSaving(true);
    setLocalError("");
    try {
      await addColor({
        color_name: trimmed,
        color_code: colorCode,
      });
      setColorName("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Gagal menambahkan warna.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteColor(id: string, name: string) {
    if (!window.confirm(`Hapus variasi warna "${name}"?`)) return;
    try {
      await deleteColor(id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Gagal menghapus warna.");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-primary" />
          Variasi Warna Kain ({colors.length})
        </h3>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={colorName}
          onChange={(e) => setColorName(e.target.value)}
          placeholder="Nama warna (mis. Navy, Maroon, Broken White)"
          className={`${inputClass} flex-1 text-xs py-1.5 h-9`}
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 h-9">
            <input
              type="color"
              value={colorCode}
              onChange={(e) => setColorCode(e.target.value)}
              className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
              title="Pilih kode warna"
            />
            <span className="text-xs font-mono text-muted-foreground">
              {colorCode}
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleAddColor}
            disabled={saving || !colorName.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? "..." : "Tambah"}
          </Button>
        </div>
      </div>

      {(localError || error) && (
        <p className="text-xs text-rose-600">{localError || error}</p>
      )}

      {loading ? (
        <div className="py-2 text-center text-xs text-muted-foreground">
          Memuat daftar warna...
        </div>
      ) : colors.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Belum ada warna. Tambahkan variasi warna untuk kain ini di atas.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto">
          {colors.map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm hover:border-primary/40 transition-colors"
            >
              <div
                className="h-3.5 w-3.5 rounded-full border border-black/10 shrink-0"
                style={{ backgroundColor: c.color_code || "#94a3b8" }}
              />
              <span className="text-xs font-medium text-foreground">
                {c.color_name}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteColor(c.id, c.color_name)}
                className="text-muted-foreground hover:text-rose-600 transition-colors p-0.5 rounded"
                title="Hapus warna"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
