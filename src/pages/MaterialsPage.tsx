import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import Card from "../components/ui/card";
import Button from "../components/ui/button";
import MaterialsTable from "../components/materials/MaterialsTable";
import MaterialModal from "../components/materials/MaterialModal";
import { useMaterials } from "../hooks/useMaterials";
import { useMaterialCategories } from "../hooks/useMaterialCategories";
import { inputClass } from "../components/ui/FormField";
import type { Material } from "../types";

export default function MaterialsPage() {
  const { categories } = useMaterialCategories();
  const {
    materials,
    loading,
    addMaterial,
    updateMaterial,
    deleteMaterial,
  } = useMaterials();

  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: materials.length };
    for (const m of materials) {
      if (m.category_id) {
        counts[m.category_id] = (counts[m.category_id] || 0) + 1;
      }
    }
    return counts;
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (activeCategoryTab !== "all" && m.category_id !== activeCategoryTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${m.name} ${m.unit} ${m.composition ?? ""} ${m.material_categories?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [materials, activeCategoryTab, searchQuery]);

  function openAddModal() {
    setEditingMaterial(null);
    setModalOpen(true);
  }

  function openEditModal(material: Material) {
    setEditingMaterial(material);
    setModalOpen(true);
  }

  async function handleSubmit(payload: Omit<Material, "id" | "material_categories">) {
    if (editingMaterial) {
      await updateMaterial(editingMaterial.id, payload);
    } else {
      await addMaterial(payload);
    }
  }

  async function handleDelete(material: Material) {
    if (!window.confirm(`Hapus material "${material.name}"?`)) return;
    await deleteMaterial(material.id);
  }

  return (
    <AppShell
      title="Material"
      subtitle="Kelola bahan baku (kain & aksesoris)"
      actions={
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah Material
        </Button>
      }
    >
      <Card>
        {/* Dynamic Category Tabs */}
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 scrollbar-none">
          <button
            onClick={() => setActiveCategoryTab("all")}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 py-3 px-2 text-sm font-medium transition-colors ${
              activeCategoryTab === "all"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Semua
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                activeCategoryTab === "all"
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {categoryCounts.all || 0}
            </span>
          </button>

          {categories.map((c) => {
            const isActive = activeCategoryTab === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategoryTab(c.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 py-3 px-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.name}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {categoryCounts[c.id] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Header */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-foreground">
            Daftar Material ({filteredMaterials.length})
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama material, komposisi..."
              className={`${inputClass} w-full sm:w-64 py-2 pl-9`}
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <MaterialsTable
            materials={filteredMaterials}
            onEdit={openEditModal}
            onDelete={handleDelete}
          />
        )}
      </Card>

      <MaterialModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingMaterial={editingMaterial}
        categories={categories}
      />
    </AppShell>
  );
}
