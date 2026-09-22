import React, { useState } from 'react';
import {
  PackageCheck,
  Shuffle,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { OrderItem } from '../../types';

interface SewingQueueTabProps {
  pool: OrderItem[];
  loading: boolean;
  onMarkReady: (ids: string[]) => Promise<void>;
  onDistribute: (ids: string[] | null, notes: string | null) => Promise<void>;
}

export default function SewingQueueTab({
  pool,
  loading,
  onMarkReady,
  onDistribute,
}: SewingQueueTabProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [distributing, setDistributing] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const totalPoolPcs = pool.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const allSelected = pool.length > 0 && selectedIds.length === pool.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : pool.map((i) => i.id as string));
  }

  async function handleDistribute() {
    setDistributing(true);
    try {
      // null = ambil semua pool, atau pakai selectedIds kalau ada pilihan spesifik
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
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Pool Jahit
          </p>
          <p className="mt-0.5 text-2xl font-black text-slate-900">
            {totalPoolPcs} <span className="text-sm font-normal text-muted-foreground">pcs</span>
          </p>
          <p className="text-xs text-muted-foreground">{pool.length} order item siap dijahit</p>
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
            disabled={distributing || pool.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
          >
            <Shuffle className="h-4 w-4" />
            {distributing ? 'Membagi...' : 'Bagikan Kerja'}
          </button>
        </div>
      </div>

      {/* Pool Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Memuat antrian jahit...
          </div>
        ) : pool.length === 0 ? (
          <div className="p-12 text-center">
            <PackageCheck className="mx-auto h-10 w-10 text-slate-200" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              Antrian jahit kosong
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tandai order item sebagai "Siap Jahit" dari halaman Order setelah bordir selesai.
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
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-border accent-primary"
                      title="Pilih semua"
                    />
                  </th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Tarif Jahit/pcs</th>
                  <th className="px-4 py-3">Siap Jahit Sejak</th>
                  <th className="px-4 py-3">Status Pool</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pool.map((item, idx) => {
                  const id = item.id as string;
                  const isSelected = selectedIds.includes(id);
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
                      className={`transition-colors cursor-pointer hover:bg-primary/5 ${
                        isSelected ? 'bg-primary/8' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                      onClick={() => toggleSelect(id)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-border accent-primary"
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
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {item.qty}{' '}
                        <span className="text-xs font-normal text-muted-foreground">pcs</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600">
                        {productData?.sewing_cost_per_pcs != null
                          ? `Rp ${Number(productData.sewing_cost_per_pcs).toLocaleString('id-ID')}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{readyAt}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                          <AlertCircle className="h-3 w-3" />
                          Menunggu distribusi
                        </span>
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
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {selectedIds.length} item dipilih. Klik "Bagikan Kerja" untuk mendistribusikan hanya item yang dipilih.
        </div>
      )}
    </div>
  );
}
