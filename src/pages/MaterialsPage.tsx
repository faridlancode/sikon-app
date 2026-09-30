import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import Card from "../components/ui/card";
import Button from "../components/ui/button";
import MaterialsTable from "../components/materials/MaterialsTable";
import MaterialModal from "../components/materials/MaterialModal";
import type { StagedColor } from "../components/materials/MaterialColorsSection";
import { useMaterials } from "../hooks/useMaterials";
import { useMaterialCategories } from "../hooks/useMaterialCategories";
import { supabase } from "../lib/supabaseClient";
import { inputClass } from "../components/ui/FormField";
import type { Material, MaterialColor } from "../types";

export default function MaterialsPage() {
  const { categories } = useMaterialCategories();
  const {
    materials,
    loading,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    refetch: refetchMaterials,
  } = useMaterials();

  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  // Grouped material colors
  const [colorsByMaterial, setColorsByMaterial] = useState<Record<string, MaterialColor[]>>({});

  const fetchColors = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("material_colors")
        .select("*")
        .eq("is_active", true)
        .order("color_name", { ascending: true });

      if (!error && data) {
        const grouped: Record<string, MaterialColor[]> = {};
        for (const c of data) {
          if (!grouped[c.material_id]) grouped[c.material_id] = [];
          grouped[c.material_id].push(c);
        }
        setColorsByMaterial(grouped);
      }
    } catch (e) {
      console.error("Gagal memuat warna material:", e);
    }
  }, []);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

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
        const colors = colorsByMaterial[m.id] || [];
        const colorNames = colors.map((c) => c.color_name).join(" ");
        const haystack = `${m.name} ${m.brand ?? ""} ${m.unit} ${m.composition ?? ""} ${m.material_categories?.name ?? ""} ${colorNames}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [materials, activeCategoryTab, searchQuery, colorsByMaterial]);

  function openAddModal() {
    setEditingMaterial(null);
    setModalOpen(true);
  }

  function openEditModal(material: Material) {
    setEditingMaterial(material);
    setModalOpen(true);
  }

  async function handleSubmit(
    payload: Omit<Material, "id" | "material_categories">,
    stagedColors?: StagedColor[]
  ) {
    if (editingMaterial) {
      await updateMaterial(editingMaterial.id, payload);
      await fetchColors();
    } else {
      const createdMat = await addMaterial(payload);
      if (createdMat && stagedColors && stagedColors.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("material_colors").insert(
            stagedColors.map((c) => ({
              material_id: createdMat.id,
              color_name: c.color_name.trim(),
              color_code: c.color_code || null,
              user_id: user.id,
              is_active: true,
            }))
          );
        }
      }
      await fetchColors();
      await refetchMaterials();
    }
  }

  async function handleDelete(material: Material) {
    if (!window.confirm(`Hapus material "${material.name}"?`)) return;
    await deleteMaterial(material.id);
    await fetchColors();
  }

  return (
    <AppShell
      title="Material"
      subtitle="Kelola bahan baku kain, kancing, sleting, benang & aksesoris konveksi"
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
              placeholder="Cari nama material, merk, warna..."
              className={`${inputClass} w-full sm:w-72 py-2 pl-9`}
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
            colorsByMaterial={colorsByMaterial}
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
