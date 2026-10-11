import { useEffect, useState, useMemo } from "react";
import { X } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import type { CategoryType, TransactionCategory, Account } from "../../types";

interface TransactionCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    type: CategoryType;
    account_id?: string | null;
  }) => Promise<unknown>;
  editingCategory: TransactionCategory | null;
  accounts?: Account[];
  accountingEnabled?: boolean;
}

export default function TransactionCategoryModal({
  open,
  onClose,
  onSubmit,
  editingCategory,
  accounts = [],
  accountingEnabled = false,
}: TransactionCategoryModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("income");
  const [accountId, setAccountId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Filter akun sesuai tipe: income -> revenue, expense -> expense
  const availableAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (!a.is_active) return false;
      if (type === "income") return a.account_type === "revenue";
      if (type === "expense") return a.account_type === "expense";
      return false;
    });
  }, [accounts, type]);

  useEffect(() => {
    if (!open) return;
    if (editingCategory) {
      setName(editingCategory.name);
      setType(editingCategory.type);
      setAccountId(editingCategory.account_id || "");
    } else {
      setName("");
      setType("income");
      setAccountId("");
    }
    setError("");
  }, [open, editingCategory]);

  // Reset/sesuaikan accountId saat type berubah bila akun sebelumnya tidak cocok
  useEffect(() => {
    if (!open) return;
    if (accountId) {
      const match = availableAccounts.some((a) => a.id === accountId);
      if (!match) {
        setAccountId(availableAccounts[0]?.id || "");
      }
    } else if (accountingEnabled && availableAccounts.length > 0 && !editingCategory) {
      setAccountId(availableAccounts[0]?.id || "");
    }
  }, [type, availableAccounts, open, accountingEnabled, editingCategory]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama kategori wajib diisi.");
      return;
    }
    if (accountingEnabled && !editingCategory && !accountId) {
      setError("Akun akuntansi wajib dipilih saat akuntansi aktif.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ name: trimmed, type, account_id: accountId || null });
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

          {/* Akun Akuntansi (hanya tampil jika sistem akuntansi aktif) */}
          {accountingEnabled && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Akun Akuntansi {!editingCategory && <span className="text-destructive">*</span>}
              </span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={inputClass}
              >
                <option value="">Pilih Akun Akuntansi</option>
                {availableAccounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.code} - {acct.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {type === "income"
                  ? "Pilih akun pendapatan (4-xxxx) untuk pencatatan otomatis transaksi pemasukan ini."
                  : "Pilih akun beban (5-xxxx / 6-xxxx) untuk pencatatan otomatis transaksi pengeluaran ini."}
              </p>
            </label>
          )}

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
