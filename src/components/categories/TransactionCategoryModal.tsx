import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import type { CategoryType, TransactionCategory } from "../../types";

interface TransactionCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; type: CategoryType }) => Promise<unknown>;
  editingCategory: TransactionCategory | null;
}

export default function TransactionCategoryModal({
  open,
  onClose,
  onSubmit,
  editingCategory,
}: TransactionCategoryModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("income");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingCategory) {
      setName(editingCategory.name);
      setType(editingCategory.type);
    } else {
      setName("");
      setType("income");
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
      await onSubmit({ name: trimmed, type });
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
          <h2 className="text-base font-semibold text-foreground">
            {editingCategory ? "Edit Kategori Transaksi" : "Tambah Kategori Transaksi"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {/* Tipe */}
          <div>
            <span className="mb-2 block text-sm font-medium text-foreground">Tipe Kategori</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("income")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                  type === "income"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Pemasukan
              </button>
              <button
                type="button"
                onClick={() => setType("expense")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                  type === "expense"
                    ? "border-rose-400 bg-rose-50 text-rose-700 ring-2 ring-rose-200"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Pengeluaran
              </button>
            </div>
          </div>

          {/* Nama */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Nama Kategori</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "income" ? "mis. Penjualan, Jasa, Investasi..." : "mis. Operasional, Gaji, Sewa Tempat..."}
              className={inputClass}
              autoFocus
            />
          </label>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>
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
