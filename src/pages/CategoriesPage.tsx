import AppShell from "../components/layout/AppShell";
import ProductCategoryList from "../components/categories/ProductCategoryList";
import MaterialCategoryList from "../components/categories/MaterialCategoryList";
import TransactionCategoryList from "../components/categories/TransactionCategoryList";

export default function CategoriesPage() {
  return (
    <AppShell
      title="Kategori"
      subtitle="Kelola kategori produk, kategori material, dan kategori transaksi keuangan"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ProductCategoryList />
        <MaterialCategoryList />
        <div className="lg:col-span-2">
          <TransactionCategoryList />
        </div>
      </div>
    </AppShell>
  );
}
