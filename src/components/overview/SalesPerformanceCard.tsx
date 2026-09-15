import { Trophy, Users } from 'lucide-react';
import Card from '../ui/card';
import { formatIDR } from '../../utils/formatCurrency';

export default function SalesPerformanceCard({ performance }) {
  const ranked = [...performance]
    .filter((s) => s.total_orders > 0)
    .sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue));

  const maxRevenue = ranked.length > 0 ? Math.max(...ranked.map((s) => Number(s.total_revenue))) : 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Sales Performance</h3>
          <p className="text-xs text-slate-400">Ranking berdasarkan total nilai order</p>
        </div>
        <Trophy className="h-4.5 w-4.5 text-amber-500" />
      </div>

      {ranked.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Users className="h-5 w-5 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">Belum ada data penjualan</p>
          <p className="mt-1 text-xs text-slate-400">
            Tambahkan sales di menu Data Sales, lalu buat order dengan sales tersebut.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ranked.map((sales, index) => {
            const revenue = Number(sales.total_revenue);
            const paid = Number(sales.total_paid);
            const widthPct = maxRevenue > 0 ? Math.max((revenue / maxRevenue) * 100, 4) : 0;
            const collectionRate = revenue > 0 ? Math.round((paid / revenue) * 100) : 0;

            return (
              <div key={sales.sales_id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                      {index + 1}
                    </span>
                    {sales.sales_name}
                  </span>
                  <span className="tabular-nums text-slate-900">{formatIDR(revenue)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{sales.total_orders} order</span>
                  <span>Terkumpul {collectionRate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
