import { useState } from "react";
import { Plus, Pencil, Trash2, Tag, Layers } from "lucide-react";
import Card from "../ui/card";
import Button from "../ui/button";
import CategoryModal from "./CategoryModal";
import { useProductCategories } from "../../hooks/useProductCategories";
import type { ProductCategory } from "../../types";

export default function ProductCategoryList() {
  const { categories, loading, addCategory, updateCategory, deleteCategory } =
    useProductCategories();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(
    null
  );

  function openAddModal() {
    setEditingCategory(null);
    setModalOpen(true);
  }

  function openEditModal(category: ProductCategory) {
    setEditingCategory(category);
    setModalOpen(true);
  }

  async function handleSubmit(payload: { name: string; is_fabric?: boolean }) {
    if (editingCategory) {
      await updateCategory(editingCategory.id, payload.name);
    } else {
      await addCategory(payload.name);
    }
  }

  async function handleDelete(category: ProductCategory) {
    if (
      !window.confirm(
        `Hapus kategori produk "${category.name}"? Produk yang terkait akan menjadi tanpa kategori.`
      )
    )
      return;
    await deleteCategory(category.id);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Kategori Product
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Kategori model pakaian (mis. Kemeja, Rompi, Celana, Jaket).
          </p>
        </div>
        <Button size="sm" onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
            <Tag className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Belum ada kategori produk.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {categories.map((category) => (
              <li
                key={category.id}
                className="group flex items-center justify-between rounded-lg border border-border px-3.5 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {category.name}
                  </p>
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

      <CategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingCategory={editingCategory}
        showFabricToggle={false}
        title={editingCategory ? "Edit Kategori Product" : "Tambah Kategori Product"}
      />
    </Card>
  );
}
