import { Search } from 'lucide-react';
import { inputClass } from '../ui/FormField';

const TYPE_TABS = [
  { value: 'all', label: 'Semua' },
  { value: 'income', label: 'Pemasukan' },
  { value: 'expense', label: 'Pengeluaran' },
];

export default function TransactionFilters({ filters, onFiltersChange, counts }) {
  function update(patch) {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <div>
      <div className="flex gap-5 border-b border-slate-100 px-4">
        {TYPE_TABS.map((tab) => {
          const isActive = filters.type === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => update({ type: tab.value })}
              className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors ${
                isActive ? 'border-emerald-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {counts?.[tab.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-900">Riwayat Transaksi</p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className={`${inputClass} w-[150px] py-2`}
          />
          <span className="text-sm text-slate-400">s/d</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            className={`${inputClass} w-[150px] py-2`}
          />

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder="Cari transaksi..."
              className={`${inputClass} w-48 py-2 pl-9`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
