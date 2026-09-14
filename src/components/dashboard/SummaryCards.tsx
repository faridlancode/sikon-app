import type { ComponentType } from 'react';
import { ArrowUpRight, ArrowDownRight, Scale, Landmark, Receipt, Pencil } from 'lucide-react';
import Card from '../ui/Card';
import { formatIDR } from '../../utils/formatCurrency';

const TONES = {
  teal: { bg: 'bg-teal-50', icon: 'text-teal-700', ring: 'ring-teal-600/10' },
  rose: { bg: 'bg-rose-50', icon: 'text-rose-700', ring: 'ring-rose-600/10' },
  slate: { bg: 'bg-slate-100', icon: 'text-slate-700', ring: 'ring-slate-600/10' },
  sky: { bg: 'bg-sky-50', icon: 'text-sky-700', ring: 'ring-sky-600/10' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-700', ring: 'ring-amber-600/10' },
};

type SummaryCardProps = {
  label: string;
  value: string;
  icon: ComponentType<any>;
  tone: keyof typeof TONES;
  onEdit?: () => void;
  hint?: string;
};

function SummaryCard({ label, value, icon: Icon, tone, onEdit, hint }: SummaryCardProps) {
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
      <div className="mt-1.5 flex items-center justify-between gap-3">
        {hint ? <p className="text-xs text-slate-400">{hint}</p> : <span />}
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <Pencil className="h-3 w-3" /> Atur saldo awal
          </button>
        )}
      </div>
    </Card>
  );
}

export default function SummaryCards({ summary, bankBalance, saldoAwal, piutang, onEditSaldoAwal }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard label="Total Pemasukan" value={formatIDR(summary.totalIncome)} icon={ArrowUpRight} tone="teal" />
      <SummaryCard label="Total Pengeluaran" value={formatIDR(summary.totalExpense)} icon={ArrowDownRight} tone="rose" />
      <SummaryCard label="Laba Bersih" value={formatIDR(summary.netProfit)} icon={Scale} tone="slate" />
      <SummaryCard
        label="Total Uang di Bank"
        value={formatIDR(bankBalance)}
        icon={Landmark}
        tone="sky"
        hint={`Saldo awal ${formatIDR(saldoAwal)}`}
        onEdit={onEditSaldoAwal}
      />
      <SummaryCard
        label="Tagihan / Piutang"
        value={formatIDR(piutang)}
        icon={Receipt}
        tone="amber"
        hint="Order belum lunas"
      />
    </div>
  );
}
