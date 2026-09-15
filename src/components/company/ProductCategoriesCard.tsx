import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';

export default function ProductCategoriesCard({ categories, loading, error, onAdd, onDelete }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    async function handleAdd(e) {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            await onAdd(name);
            setName('');
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Gagal menambahkan kategori.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Kategori Produk</h2>
                <p className="mt-1 text-xs text-slate-500">Kategori ini akan menjadi pilihan nama item pada order.</p>
            </div>
            <div className="space-y-4 p-5">
                <form onSubmit={handleAdd} className="flex gap-2">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="mis. Kemeja"
                        className={inputClass}
                    />
                    <Button type="submit" disabled={saving}>
                        <Plus className="h-4 w-4" />
                        Tambah
                    </Button>
                </form>
                {(formError || error) && <p className="text-sm text-rose-600">{formError || error}</p>}
                {loading ? (
                    <p className="text-sm text-slate-400">Memuat kategori...</p>
                ) : categories.length === 0 ? (
                    <p className="text-sm text-slate-400">Belum ada kategori produk.</p>
                ) : (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {categories.map((category) => (
                            <div key={category.id} className="flex items-center justify-between px-3 py-2.5">
                                <span className="text-sm text-slate-700">{category.name}</span>
                                <button
                                    type="button"
                                    onClick={() => onDelete(category.id)}
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    title={`Hapus ${category.name}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
}
