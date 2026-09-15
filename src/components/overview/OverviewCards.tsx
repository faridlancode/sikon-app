import { TrendingUp, ShoppingBag, Receipt, Calculator } from 'lucide-react';
import Card from '../ui/card';
import { formatIDR } from '../../utils/formatCurrency';

const TONES = {
  teal: { bg: 'bg-teal-50', icon: 'text-teal-700', ring: 'ring-teal-600/10' },
  sky: { bg: 'bg-sky-50', icon: 'text-sky-700', ring: 'ring-sky-600/10' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-700', ring: 'ring-amber-600/10' },
  slate: { bg: 'bg-slate-100', icon: 'text-slate-700', ring: 'ring-slate-600/10' },
  violet: { bg: 'bg-violet-50', icon: 'text-violet-700', ring: 'ring-violet-600/10' },
};

function OverviewCard({ label, value, icon: Icon, tone, hint }) {
  const t = TONES[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.bg} ring-1 ${t.ring}`}>
          <Icon className={`h-4 w-4 ${t.icon}`} strokeWidth={2.25} />
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export default function OverviewCards({ summary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        label="Total Revenue"
        value={formatIDR(summary.totalRevenue)}
        icon={TrendingUp}
        tone="teal"
        hint="Total nilai seluruh order"
      />
      <OverviewCard
        label="Total Order"
        value={summary.totalOrders.toLocaleString('id-ID')}
        icon={ShoppingBag}
        tone="violet"
        hint="Seluruh order tercatat"
      />
      <OverviewCard
        label="Sisa Tagihan"
        value={formatIDR(summary.totalOutstanding)}
        icon={Receipt}
        tone="amber"
        hint="Dari order belum lunas"
      />
      <OverviewCard
        label="Rata-rata Nilai Order"
        value={formatIDR(summary.avgOrderValue)}
        icon={Calculator}
        tone="slate"
        hint="Total revenue ÷ total order"
      />
    </div>
  );
}
