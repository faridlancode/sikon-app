import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import Card from "../components/ui/card";
import Button from "../components/ui/button";
import ProductsTable from "../components/products/ProductsTable";
import ProductModal from "../components/products/ProductModal";
import { useProducts, type ProductWithDetails } from "../hooks/useProducts";
import { useProductCategories } from "../hooks/useProductCategories";
import { useMaterialCategories } from "../hooks/useMaterialCategories";
import { useMaterials } from "../hooks/useMaterials";
import { inputClass } from "../components/ui/FormField";
import type { Product, ProductMaterialLine, ProductFabricSlot } from "../types";

export default function ProductsPage() {
  const { categories: productCategories } = useProductCategories();
  const { categories: materialCategories } = useMaterialCategories();
  const { materials: allMaterials } = useMaterials();

  const {
    products,
    loading,
    createProduct,
    updateProduct,
    deleteProduct,
    fetchProductBom,
  } = useProducts();

  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithDetails | null>(
    null
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    for (const p of products) {
      if (p.category_id) {
        counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      }
    }
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (activeCategoryTab !== "all" && p.category_id !== activeCategoryTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${p.name} ${p.description ?? ""} ${p.product_categories?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, activeCategoryTab, searchQuery]);

  function openAddModal() {
    setEditingProduct(null);
    setModalOpen(true);
  }

  function openEditModal(product: ProductWithDetails) {
    setEditingProduct(product);
    setModalOpen(true);
  }

  async function handleSubmit(payload: {
    product: Omit<Product, "id" | "product_categories">;
    materials: ProductMaterialLine[];
    fabricSlots: ProductFabricSlot[];
  }) {
    if (editingProduct) {
      await updateProduct(editingProduct.id, payload);
    } else {
      await createProduct(payload);
    }
  }

  async function handleDelete(product: ProductWithDetails) {
    if (
      !window.confirm(
        `Hapus produk "${product.name}"? Product yang sudah pernah dipakai di order tetap muncul historinya, tapi tidak bisa dipilih lagi untuk order baru.`
      )
    ) {
      return;
    }
    await deleteProduct(product.id);
  }

  return (
    <AppShell
      title="Product"
      subtitle="Kelola resep / BOM produk (biaya potong, jahit, aksesoris & slot kain)"
      actions={
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah Product
        </Button>
      }
    >
      <Card>
        {/* Category Tabs */}
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

          {productCategories.map((c) => {
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

        {/* Search header */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-foreground">
            Daftar Model Produk ({filteredProducts.length})
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari produk..."
              className={`${inputClass} w-full sm:w-64 py-2 pl-9`}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <ProductsTable
            products={filteredProducts}
            onEdit={openEditModal}
            onDelete={handleDelete}
          />
        )}
      </Card>

      <ProductModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingProduct={editingProduct}
        productCategories={productCategories}
        materialCategories={materialCategories}
        allMaterials={allMaterials}
        fetchProductBom={fetchProductBom}
      />
    </AppShell>
  );
}
