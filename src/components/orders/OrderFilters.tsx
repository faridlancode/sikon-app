import { Search } from 'lucide-react';
import { inputClass } from '../ui/FormField';

const STATUS_TABS = [
  { value: 'all', label: 'Semua' },
  { value: 'belum_lunas', label: 'Belum Lunas' },
  { value: 'lunas', label: 'Lunas' },
];

export default function OrderFilters({ filters, onFiltersChange, counts }) {
  function update(patch) {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <div>
      <div className="flex gap-5 border-b border-slate-100 px-4">
        {STATUS_TABS.map((tab) => {
          const isActive = filters.status === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => update({ status: tab.value })}
              className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors ${
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                  isActive ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {counts?.[tab.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between p-4">
        <p className="text-sm font-semibold text-slate-900">Order List</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Cari order, customer, atau sales..."
            className={`${inputClass} w-64 py-2 pl-9`}
          />
        </div>
      </div>
    </div>
  );
}
