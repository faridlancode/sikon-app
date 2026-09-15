import AppShell from '../components/layout/AppShell';
import ProductCategoriesCard from '../components/company/ProductCategoriesCard';
import { useProductCategories } from '../hooks/useProductCategories';

export default function ProductCategoriesPage() {
    const { categories, loading, error, addCategory, deleteCategory } = useProductCategories();

    return (
        <AppShell title="Kategori Produk" subtitle="Kelola kategori yang tersedia sebagai nama item pada order">
            <div className="max-w-3xl">
                <ProductCategoriesCard
                    categories={categories}
                    loading={loading}
                    error={error}
                    onAdd={addCategory}
                    onDelete={deleteCategory}
                />
            </div>
        </AppShell>
    );
}