import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Package, Layers, Palette, CheckCircle2, X } from "lucide-react";
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
  const [statusFilter, setStatusFilter] = useState("all");

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
      if (statusFilter === "active" && !m.is_active) return false;
      if (statusFilter === "inactive" && m.is_active) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const colors = colorsByMaterial[m.id] || [];
        const colorNames = colors.map((c) => c.color_name).join(" ");
        const haystack = `${m.name} ${m.brand ?? ""} ${m.unit} ${m.composition ?? ""} ${m.material_categories?.name ?? ""} ${colorNames}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [materials, activeCategoryTab, searchQuery, colorsByMaterial, statusFilter]);

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
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Package className="h-4 w-4" /> Master material
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Total material", value: materials.length, icon: Package },
            { label: "Material aktif", value: materials.filter((m) => m.is_active).length, icon: CheckCircle2 },
            { label: "Kategori terpakai", value: new Set(materials.map((m) => m.category_id).filter(Boolean)).size, icon: Layers },
            { label: "Varian warna", value: Object.values(colorsByMaterial).reduce((sum, colors) => sum + colors.length, 0), icon: Palette },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{loading ? "—" : value}</p>
            </Card>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-soft" role="group" aria-label="Kategori material">
          {[{ id: "all", name: "Semua" }, ...categories].map((category) => (
            <Button
              key={category.id}
              variant={activeCategoryTab === category.id ? "default" : "ghost"}
              size="sm"
              aria-pressed={activeCategoryTab === category.id}
              onClick={() => setActiveCategoryTab(category.id)}
              className="h-9 shrink-0 gap-2 px-3 text-xs"
            >
              {category.id === "all" && <Layers className="h-4 w-4" />}
              {category.name}
              <span className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${activeCategoryTab === category.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {categoryCounts[category.id] || 0}
              </span>
            </Button>
          ))}
        </div>
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="shrink-0">
              <h2 className="text-sm font-semibold text-foreground">Daftar Material</h2>
              <p className="mt-1 text-xs text-muted-foreground">{filteredMaterials.length} dari {materials.length} material</p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  aria-label="Cari material"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari material, merek, warna…"
                  className={`${inputClass} w-full py-2 pl-9`}
                />
              </div>
              <select aria-label="Status material" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-auto py-2`}>
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
              {(searchQuery || statusFilter !== "all" || activeCategoryTab !== "all") && (
                <Button variant="ghost" size="sm" title="Reset filter" aria-label="Reset filter" className="h-9 w-9 p-0" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setActiveCategoryTab("all"); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
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
      </div>

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
