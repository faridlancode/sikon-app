import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";

export interface CategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; is_fabric?: boolean }) => Promise<unknown>;
  editingCategory: { id: string; name: string; is_fabric?: boolean } | null;
  showFabricToggle: boolean;
  title: string;
}

export default function CategoryModal({
  open,
  onClose,
  onSubmit,
  editingCategory,
  showFabricToggle,
  title,
}: CategoryModalProps) {
  const [name, setName] = useState("");
  const [isFabric, setIsFabric] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingCategory) {
      setName(editingCategory.name);
      setIsFabric(Boolean(editingCategory.is_fabric));
    } else {
      setName("");
      setIsFabric(false);
    }
    setError("");
  }, [open, editingCategory]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama kategori wajib diisi.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        name: trimmed,
        ...(showFabricToggle ? { is_fabric: isFabric } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan kategori.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Nama Kategori
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Kemeja, Kancing, Katun..."
              className={inputClass}
              autoFocus
            />
          </label>

          {showFabricToggle && (
            <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFabric}
                onChange={(e) => setIsFabric(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Ini kategori kain?</p>
                <p className="text-xs text-muted-foreground">
                  Akan memunculkan field komposisi, instruksi perawatan, dan variasi warna di form Material.
                </p>
              </div>
            </label>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Menyimpan..." : editingCategory ? "Simpan Perubahan" : "Tambah Kategori"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
