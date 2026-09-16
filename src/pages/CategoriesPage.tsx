import AppShell from "../components/layout/AppShell";
import ProductCategoryList from "../components/categories/ProductCategoryList";
import MaterialCategoryList from "../components/categories/MaterialCategoryList";

export default function CategoriesPage() {
  return (
    <AppShell
      title="Kategori"
      subtitle="Kelola kategori product dan kategori material"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ProductCategoryList />
        <MaterialCategoryList />
      </div>
    </AppShell>
  );
}
