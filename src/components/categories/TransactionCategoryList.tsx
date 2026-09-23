import { useState } from "react";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import Card from "../ui/card";
import Button from "../ui/button";
import TransactionCategoryModal from "./TransactionCategoryModal";
import { useCategories } from "../../hooks/useCategories";
import type { CategoryType, TransactionCategory } from "../../types";

type FilterTab = "all" | "income" | "expense";

export default function TransactionCategoryList() {
  const { categories, incomeCategories, expenseCategories, loading, addCategory, updateCategory, deleteCategory } =
    useCategories();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TransactionCategory | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  function openAddModal() {
    setEditingCategory(null);
    setModalOpen(true);
  }

  function openEditModal(category: TransactionCategory) {
    setEditingCategory(category);
    setModalOpen(true);
  }

  async function handleSubmit(payload: { name: string; type: CategoryType }) {
    if (editingCategory) {
      await updateCategory(editingCategory.id, payload.name, payload.type);
    } else {
      await addCategory(payload.name, payload.type);
    }
  }

  async function handleDelete(category: TransactionCategory) {
    if (
      !window.confirm(
        `Hapus kategori "${category.name}"? Transaksi yang terkait akan menjadi tanpa kategori.`
      )
    )
      return;
    await deleteCategory(category.id);
  }

  const displayCategories =
    activeFilter === "income"
      ? incomeCategories
      : activeFilter === "expense"
        ? expenseCategories
        : categories;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Kategori Transaksi Keuangan
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Kategori pemasukan &amp; pengeluaran untuk pencatatan keuangan.
          </p>
        </div>
        <Button size="sm" onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="mt-4 flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {(
          [
            { key: "all", label: "Semua", count: categories.length },
            { key: "income", label: "Pemasukan", count: incomeCategories.length },
            { key: "expense", label: "Pengeluaran", count: expenseCategories.length },
          ] as { key: FilterTab; label: string; count: number }[]
        ).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              activeFilter === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                activeFilter === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : displayCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Belum ada kategori transaksi.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {displayCategories.map((category) => (
              <li
                key={category.id}
                className="group flex items-center justify-between rounded-lg border border-border px-3.5 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      category.type === "income"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {category.type === "income" ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{category.name}</p>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        category.type === "income" ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {category.type === "income" ? "Pemasukan" : "Pengeluaran"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEditModal(category)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit kategori"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(category)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    title="Hapus kategori"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TransactionCategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingCategory={editingCategory}
      />
    </Card>
  );
}
