import React, { useState, useMemo } from 'react';
import { Banknote, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { formatIDR } from '../../utils/formatCurrency';
import type { PieceworkTask } from '../../types';

interface ManualPayPanelProps {
  tasks: PieceworkTask[];
  loading: boolean;
  onMarkManualPaid: (ids: string[], note: string | null) => Promise<void>;
}

export default function ManualPayPanel({
  tasks,
  loading,
  onMarkManualPaid,
}: ManualPayPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) => {
      return (
        (t.staff?.name ?? '').toLowerCase().includes(q) ||
        (t.orders?.order_id ?? '').toLowerCase().includes(q) ||
        (t.products?.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [tasks, search]);

  const totalSelected = useMemo(
    () =>
      tasks
        .filter((t) => selectedIds.includes(t.id))
        .reduce((s, t) => s + Number(t.total_wage), 0),
    [tasks, selectedIds]
  );

  const totalAll = useMemo(
    () => tasks.reduce((s, t) => s + Number(t.total_wage), 0),
    [tasks]
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((t) => t.id));
    }
  }

  async function handlePay() {
    if (selectedIds.length === 0) {
      setError('Pilih minimal 1 task untuk dibayar');
      return;
    }
    if (!note.trim()) {
      setError('Isi keterangan pembayaran (misal: "Cash langsung Sabtu 21 Sep")');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onMarkManualPaid(selectedIds, note);
      setSelectedIds([]);
      setNote('');
    } catch (e: any) {
      setError(e.message ?? 'Gagal menandai pembayaran');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Upah Susulan Belum Dibayar
          </p>
          <p className="mt-0.5 text-2xl font-black text-slate-900">{formatIDR(totalAll)}</p>
          <p className="text-xs text-muted-foreground">{tasks.length} task belum terbayar</p>
        </div>
        {selectedIds.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
            <p className="font-semibold text-amber-800">
              {selectedIds.length} task dipilih — {formatIDR(totalSelected)}
            </p>
            <p className="text-xs text-amber-600">Akan ditandai sebagai dibayar cash</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Cari penjahit atau order..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat task susulan...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Banknote className="mx-auto h-10 w-10 text-slate-200" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {tasks.length === 0
                ? 'Tidak ada task susulan yang perlu dibayar'
                : 'Tidak ada task yang cocok'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Task susulan muncul di sini kalau ada upah jahit yang lolos QC setelah payroll mingguan ditutup.
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
                      checked={selectedIds.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3">Penjahit</th>
                  <th className="px-4 py-3">Order / Produk</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Tarif/pcs</th>
                  <th className="px-4 py-3 text-right">Total Upah</th>
                  <th className="px-4 py-3">Tgl Lolos QC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((task, idx) => {
                  const isSelected = selectedIds.includes(task.id);
                  const passedAt = task.completed_at
                    ? new Date(task.completed_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-';
                  return (
                    <tr
                      key={task.id}
                      onClick={() => toggleSelect(task.id)}
                      className={`cursor-pointer transition-colors hover:bg-primary/5 ${
                        isSelected ? 'bg-amber-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(task.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-900">{task.staff?.name ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">{task.staff?.role}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-800">{task.products?.name ?? '-'}</p>
                        {task.orders && (
                          <p className="mt-0.5 text-xs">
                            <span className="font-mono font-semibold text-primary">{task.orders.order_id}</span>
                            <span className="ml-1 text-slate-400">({task.orders.customer_name})</span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                        {task.qty}{' '}
                        <span className="text-xs font-normal text-muted-foreground">pcs</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-slate-600">
                        {formatIDR(task.rate_per_unit)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-slate-900">
                        {formatIDR(task.total_wage)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{passedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action bar */}
      {tasks.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Keterangan Pembayaran <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Cash langsung Sabtu 22 Sep 2026"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}
          <button
            onClick={handlePay}
            disabled={submitting || selectedIds.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 transition disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting
              ? 'Menyimpan...'
              : `Tandai ${selectedIds.length} Task Dibayar Cash (${formatIDR(totalSelected)})`}
          </button>
          <p className="text-[11px] text-center text-muted-foreground">
            Task yang ditandai tidak akan masuk ke payroll resmi berikutnya.
          </p>
        </div>
      )}
    </div>
  );
}
