import React, { useState, useMemo } from 'react';
import {
  PackageCheck,
  Shuffle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import type { OrderItem } from '../../types';

interface SewingQueueTabProps {
  pool: (OrderItem & {
    assigned_qty?: number;
    remaining_qty?: number;
    pool_status?: 'waiting' | 'partial' | 'distributed';
  })[];
  loading: boolean;
  onMarkReady: (ids: string[]) => Promise<void>;
  onDistribute: (ids: string[] | null, notes: string | null) => Promise<void>;
}

type FilterStatus = 'waiting' | 'distributed' | 'all';

export default function SewingQueueTab({
  pool,
  loading,
  onDistribute,
}: SewingQueueTabProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [distributing, setDistributing] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('waiting');

  // Hitung metrik pool
  const waitingItems = useMemo(
    () => pool.filter((i) => (i.remaining_qty ?? (Number(i.qty) || 0)) > 0),
    [pool]
  );
  const distributedItems = useMemo(
    () => pool.filter((i) => (i.remaining_qty ?? (Number(i.qty) || 0)) <= 0),
    [pool]
  );

  const totalRemainingPcs = useMemo(
    () =>
      pool.reduce(
        (s, i) => s + (i.remaining_qty != null ? i.remaining_qty : Number(i.qty) || 0),
        0
      ),
    [pool]
  );

  const totalAssignedPcs = useMemo(
    () => pool.reduce((s, i) => s + (Number(i.assigned_qty) || 0), 0),
    [pool]
  );

  // Filter daftar tampilan
  const displayedItems = useMemo(() => {
    if (statusFilter === 'waiting') return waitingItems;
    if (statusFilter === 'distributed') return distributedItems;
    return pool;
  }, [pool, statusFilter, waitingItems, distributedItems]);

  // Hanya item yang masih punya sisa antri yang bisa dipilih
  const selectableDisplayed = displayedItems.filter(
    (i) => (i.remaining_qty ?? (Number(i.qty) || 0)) > 0
  );

  const allSelectableSelected =
    selectableDisplayed.length > 0 &&
    selectableDisplayed.every((i) => selectedIds.includes(i.id as string));

  function toggleSelect(id: string, canSelect: boolean) {
    if (!canSelect) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (allSelectableSelected) {
      // Unselect only the currently selectable displayed
      const selectableIds = new Set(selectableDisplayed.map((i) => i.id as string));
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.has(id)));
    } else {
      const newIds = new Set([
        ...selectedIds,
        ...selectableDisplayed.map((i) => i.id as string),
      ]);
      setSelectedIds(Array.from(newIds));
    }
  }

  async function handleDistribute() {
    if (totalRemainingPcs <= 0) return;
    setDistributing(true);
    try {
      // null = ambil semua pool yang siap & belum fully-assigned, atau pakai selectedIds
      await onDistribute(selectedIds.length > 0 ? selectedIds : null, notes || null);
      setSelectedIds([]);
      setNotes('');
      setShowNotes(false);
    } finally {
      setDistributing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Antrian Belum Dibagi
            </p>
            <p className="mt-0.5 text-2xl font-black text-slate-900">
              {totalRemainingPcs}{' '}
              <span className="text-sm font-normal text-muted-foreground">pcs</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {waitingItems.length} item menunggu penugasan penjahit
            </p>
          </div>

          <div className="hidden sm:block h-10 w-px bg-slate-200" />

          <div className="hidden sm:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sudah Didistribusikan
            </p>
            <p className="mt-0.5 text-xl font-bold text-emerald-700">
              {totalAssignedPcs}{' '}
              <span className="text-sm font-normal text-muted-foreground">pcs</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {distributedItems.length} item terbagi penuh
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showNotes && (
            <input
              type="text"
              placeholder="Catatan distribusi (opsional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-64"
            />
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-slate-600 hover:bg-muted transition"
            title="Tambah catatan"
          >
            {showNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={handleDistribute}
            disabled={distributing || totalRemainingPcs <= 0}
            title={
              totalRemainingPcs <= 0
                ? 'Semua order item sudah terdistribusi penuh ke penjahit'
                : 'Bagikan antrian jahit secara proporsional ke penjahit aktif'
            }
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <Shuffle className="h-4 w-4" />
            {distributing
              ? 'Membagi...'
              : selectedIds.length > 0
              ? `Bagikan Terpilih (${selectedIds.length})`
              : 'Bagikan Kerja'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setStatusFilter('waiting')}
              className={`rounded-md px-3 py-1.5 transition ${
                statusFilter === 'waiting'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'hover:text-slate-900'
              }`}
            >
              Menunggu Distribusi ({waitingItems.length})
            </button>
            <button
              onClick={() => setStatusFilter('distributed')}
              className={`rounded-md px-3 py-1.5 transition ${
                statusFilter === 'distributed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'hover:text-slate-900'
              }`}
            >
              Sudah Dibagikan ({distributedItems.length})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-md px-3 py-1.5 transition ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'hover:text-slate-900'
              }`}
            >
              Semua Pool ({pool.length})
            </button>
          </div>
        </div>

        {totalRemainingPcs === 0 && pool.length > 0 && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Semua item di antrian jahit telah didistribusikan ke penjahit
          </span>
        )}
      </div>

      {/* Pool Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Memuat antrian jahit...
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="p-12 text-center">
            <PackageCheck className="mx-auto h-10 w-10 text-slate-200" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {statusFilter === 'waiting'
                ? 'Tidak ada item yang menunggu distribusi'
                : 'Tidak ada item pada filter ini'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {statusFilter === 'waiting' && distributedItems.length > 0
                ? 'Semua item sudah berhasil dibagikan ke penjahit. Cek tab "Beban Penjahit" untuk melihat rincian alokasi.'
                : 'Tandai order item sebagai "Siap Jahit" dari halaman Order atau Timeline setelah bordir selesai.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={toggleAll}
                      disabled={selectableDisplayed.length === 0}
                      className="h-4 w-4 rounded border-border accent-primary disabled:opacity-30"
                      title="Pilih semua yang dapat didistribusikan"
                    />
                  </th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3 text-right">Qty Order</th>
                  <th className="px-4 py-3 text-right">Terdistribusi</th>
                  <th className="px-4 py-3 text-right">Sisa Antri</th>
                  <th className="px-4 py-3 text-right">Tarif Jahit/pcs</th>
                  <th className="px-4 py-3">Siap Sejak</th>
                  <th className="px-4 py-3">Status Pool</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedItems.map((item, idx) => {
                  const id = item.id as string;
                  const isSelected = selectedIds.includes(id);
                  const itemQty = Number(item.qty) || 0;
                  const assignedQty = Number(item.assigned_qty) || 0;
                  const remainingQty = item.remaining_qty ?? Math.max(0, itemQty - assignedQty);
                  const isFullyAssigned = remainingQty <= 0;
                  const isPartiallyAssigned = assignedQty > 0 && remainingQty > 0;

                  const readyAt = item.ready_for_sewing_at
                    ? new Date(item.ready_for_sewing_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-';
                  const orderData = (item as any).orders;
                  const productData = (item as any).products;

                  return (
                    <tr
                      key={id}
                      className={`transition-colors ${
                        isFullyAssigned
                          ? 'bg-slate-50/50 opacity-80 cursor-default'
                          : 'cursor-pointer hover:bg-primary/5'
                      } ${isSelected ? 'bg-primary/8' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                      onClick={() => toggleSelect(id, !isFullyAssigned)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isFullyAssigned}
                          onChange={() => toggleSelect(id, !isFullyAssigned)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-border accent-primary disabled:opacity-30"
                          title={
                            isFullyAssigned
                              ? 'Item ini sudah terdistribusi penuh ke penjahit'
                              : 'Pilih item untuk didistribusikan'
                          }
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.name_item || 'Item'}
                      </td>
                      <td className="px-4 py-3">
                        {orderData ? (
                          <div>
                            <span className="font-mono text-xs font-semibold text-primary">
                              {orderData.order_id}
                            </span>
                            <span className="ml-1 text-xs text-slate-500">
                              ({orderData.customer_name})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {productData?.name ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        {itemQty} pcs
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">
                        {assignedQty > 0 ? `${assignedQty} pcs` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {remainingQty}{' '}
                        <span className="text-xs font-normal text-muted-foreground">pcs</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600">
                        {productData?.sewing_cost_per_pcs != null
                          ? `Rp ${Number(productData.sewing_cost_per_pcs).toLocaleString('id-ID')}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{readyAt}</td>
                      <td className="px-4 py-3">
                        {isFullyAssigned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Sudah didistribusikan
                          </span>
                        ) : isPartiallyAssigned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                            <Clock className="h-3 w-3" />
                            Sebagian ({remainingQty} sisa)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                            <AlertCircle className="h-3 w-3" />
                            Menunggu distribusi
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {selectedIds.length} item dipilih. Klik "Bagikan Kerja" untuk mendistribusikan hanya
              item yang dipilih.
            </span>
          </div>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs font-semibold underline hover:text-primary/80"
          >
            Batalkan Pilihan
          </button>
        </div>
      )}
    </div>
  );
}
