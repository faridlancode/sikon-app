import { Package } from 'lucide-react';
import Card from '../ui/card';

export default function CategoryQuantityCard({ categories }) {
  const total = categories.reduce((sum, category) => sum + Number(category.qty || 0), 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Qty per Kategori</h3>
          <p className="text-xs text-slate-400">Jumlah produk dari seluruh order</p>
        </div>
        <Package className="h-4.5 w-4.5 text-primary" />
      </div>

      {categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Belum ada data kategori.</p>
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.name} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{category.name}</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {Number(category.qty).toLocaleString('id-ID')} pcs
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
            <span>Total Qty</span>
            <span className="tabular-nums">{total.toLocaleString('id-ID')} pcs</span>
          </div>
        </div>
      )}
    </Card>
  );
}
