import { useState } from "react";
import { Plus, Pencil, Trash2, Package, Sparkles } from "lucide-react";
import Card from "../ui/card";
import Button from "../ui/button";
import CategoryModal from "./CategoryModal";
import { useMaterialCategories } from "../../hooks/useMaterialCategories";
import type { MaterialCategory } from "../../types";

export default function MaterialCategoryList() {
  const { categories, loading, addCategory, updateCategory, deleteCategory } =
    useMaterialCategories();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<MaterialCategory | null>(null);

  function openAddModal() {
    setEditingCategory(null);
    setModalOpen(true);
  }

  function openEditModal(category: MaterialCategory) {
    setEditingCategory(category);
    setModalOpen(true);
  }

  async function handleSubmit(payload: { name: string; is_fabric?: boolean }) {
    if (editingCategory) {
      await updateCategory(editingCategory.id, payload);
    } else {
      await addCategory(payload);
    }
  }

  async function handleDelete(category: MaterialCategory) {
    if (
      !window.confirm(
        `Hapus kategori material "${category.name}"? Material yang terkait akan menjadi tanpa kategori.`
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
            <Package className="h-4 w-4 text-primary" />
            Kategori Material
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bahan baku & aksesoris (mis. Kain, Kancing, Benang, Resleting).
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
            <Package className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Belum ada kategori material.
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
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {category.name}
                      </p>
                      {category.is_fabric && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                          <Sparkles className="h-2.5 w-2.5 text-emerald-600" />
                          Kain
                        </span>
                      )}
                    </div>
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

      <CategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingCategory={editingCategory}
        showFabricToggle={true}
        title={
          editingCategory ? "Edit Kategori Material" : "Tambah Kategori Material"
        }
      />
    </Card>
  );
}
