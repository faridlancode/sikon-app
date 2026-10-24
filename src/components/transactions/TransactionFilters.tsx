import { Search, Info } from 'lucide-react';
import { inputClass } from '../ui/FormField';

const TYPE_TABS = [
  { value: 'all', label: 'Semua' },
  { value: 'income', label: 'Pemasukan' },
  { value: 'expense', label: 'Pengeluaran' },
];

export default function TransactionFilters({ filters, onFiltersChange, counts, poBatches = [] }) {
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
              className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${isActive ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                  }`}
              >
                {counts?.[tab.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-900">Riwayat Transaksi</p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter PO khusus transaksi order */}
          {poBatches.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">PO:</span>
              <select
                value={filters.poBatchId || 'all'}
                onChange={(e) => update({ poBatchId: e.target.value })}
                className={`${inputClass} !w-[150px] py-1.5 text-xs`}
                title="Filter transaksi pembayaran pesanan berdasarkan Batch PO"
              >
                <option value="all">Semua PO</option>
                <option value="none">Order Tanpa PO</option>
                {poBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.code || 'PO'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className={`${inputClass} !w-[140px] py-1.5 text-xs`}
          />
          <span className="text-xs text-slate-400">s/d</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            className={`${inputClass} !w-[140px] py-1.5 text-xs`}
          />

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder="Cari transaksi..."
              className={`${inputClass} !w-44 py-1.5 pl-8 text-xs`}
            />
          </div>
        </div>
      </div>

      {/* Catatan penjelas jika filter PO sedang aktif */}
      {filters.poBatchId && filters.poBatchId !== 'all' && (
        <div className="px-4 pb-3 -mt-1 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>Filter PO hanya menyaring transaksi pembayaran pesanan (order). Transaksi operasional non-order tidak terkait Batch PO.</span>
        </div>
      )}
    </div>
  );
}
