import React, { useState, useMemo } from 'react';
import {
  Scissors,
  CheckCircle2,
  Clock,
  Coins,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  FileText,
  Filter,
} from 'lucide-react';
import { formatIDR } from '../../utils/formatCurrency';
import type { PieceworkTask } from '../../types';

interface PieceworkTasksTabProps {
  tasks: PieceworkTask[];
  loading: boolean;
  onNewTask: () => void;
  onEditTask: (task: PieceworkTask) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'completed' | 'paid') => Promise<void>;
  onDeleteTask: (task: PieceworkTask) => void;
}

export default function PieceworkTasksTab({
  tasks,
  loading,
  onNewTask,
  onEditTask,
  onUpdateStatus,
  onDeleteTask,
}: PieceworkTasksTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'paid'>('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'cutting' | 'sewing' | 'finishing' | 'other'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Summary Metrics
  const stats = useMemo(() => {
    const pending = tasks.filter((t) => t.status === 'pending');
    const completed = tasks.filter((t) => t.status === 'completed');
    const paid = tasks.filter((t) => t.status === 'paid');

    const pendingTotal = pending.reduce((sum, t) => sum + Number(t.total_wage || 0), 0);
    const completedTotal = completed.reduce((sum, t) => sum + Number(t.total_wage || 0), 0);
    const paidTotal = paid.reduce((sum, t) => sum + Number(t.total_wage || 0), 0);

    return {
      totalCount: tasks.length,
      pendingCount: pending.length,
      pendingTotal,
      completedCount: completed.length,
      completedTotal,
      paidCount: paid.length,
      paidTotal,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Status filter
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;

      // Task type filter
      if (taskTypeFilter !== 'all' && t.task_type !== taskTypeFilter) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const staffName = t.staff?.name?.toLowerCase() || '';
        const orderId = t.orders?.order_id?.toLowerCase() || '';
        const custName = t.orders?.customer_name?.toLowerCase() || '';
        const prodName = t.products?.name?.toLowerCase() || '';
        const notes = t.notes?.toLowerCase() || '';

        return (
          staffName.includes(q) ||
          orderId.includes(q) ||
          custName.includes(q) ||
          prodName.includes(q) ||
          notes.includes(q)
        );
      }

      return true;
    });
  }, [tasks, statusFilter, taskTypeFilter, search]);

  async function handleStatusChange(id: string, newStatus: 'pending' | 'completed' | 'paid') {
    try {
      setUpdatingId(id);
      await onUpdateStatus(id, newStatus);
    } finally {
      setUpdatingId(null);
    }
  }

  function getTaskTypeBadge(type: string) {
    switch (type) {
      case 'cutting':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            <Scissors className="h-3 w-3" /> Potong (Cutting)
          </span>
        );
      case 'sewing':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 border border-purple-200">
            <FileText className="h-3 w-3" /> Jahit (Sewing)
          </span>
        );
      case 'finishing':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
            Finishing / QC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
            Lainnya
          </span>
        );
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs font-medium text-amber-800 border border-amber-300">
            <Clock className="h-3 w-3" /> Sedang Dikerjakan
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100/70 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-300">
            <CheckCircle2 className="h-3 w-3 text-blue-600" /> Selesai (Siap Bayar)
          </span>
        );
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-300">
            <Coins className="h-3 w-3 text-emerald-600" /> Sudah Terbayar
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sedang Dikerjakan
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatIDR(stats.pendingTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.pendingCount} tugas dalam proses pengerjaan
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Selesai (Siap Masuk Payroll)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-900">{formatIDR(stats.completedTotal)}</p>
          <p className="mt-1 text-xs text-blue-700">
            {stats.completedCount} tugas selesai, akan dicairkan saat payroll Sabtu
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Sudah Dicairkan / Dibayar
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-900">{formatIDR(stats.paidTotal)}</p>
          <p className="mt-1 text-xs text-emerald-700">
            {stats.paidCount} tugas telah lunas dibayarkan
          </p>
        </div>
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari tukang, produk, no SPK/order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Type Filter */}
          <select
            value={taskTypeFilter}
            onChange={(e) => setTaskTypeFilter(e.target.value as any)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Semua Jenis Pekerjaan</option>
            <option value="cutting">Potong (Cutting)</option>
            <option value="sewing">Jahit (Sewing)</option>
            <option value="finishing">Finishing / QC</option>
            <option value="other">Lainnya</option>
          </select>
        </div>

        <button
          onClick={onNewTask}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <Plus className="h-4 w-4" />
          Catat Tugas Borongan
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 ${
            statusFilter === 'all'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Semua ({stats.totalCount})
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 ${
            statusFilter === 'completed'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Siap Bayar ({stats.completedCount})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 ${
            statusFilter === 'pending'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Sedang Proses ({stats.pendingCount})
        </button>
        <button
          onClick={() => setStatusFilter('paid')}
          className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 ${
            statusFilter === 'paid'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Sudah Dibayar ({stats.paidCount})
        </button>
      </div>

      {/* Tasks Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat data pekerjaan borongan...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">Tidak ada data tugas borongan ditemukan</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || statusFilter !== 'all' || taskTypeFilter !== 'all'
                ? 'Coba sesuaikan kata kunci pencarian atau filter Anda.'
                : 'Klik tombol "Catat Tugas Borongan" untuk menambahkan pekerjaan penjahit atau tukang potong.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-4 py-3 text-center text-slate-400">#</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Nama Pekerja</th>
                  <th className="px-4 py-3">Jenis Tugas</th>
                  <th className="px-4 py-3">Produk &amp; SPK</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Tarif/Pcs</th>
                  <th className="px-4 py-3 text-right bg-primary/5 text-primary">Total Upah</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task, idx) => {
                  const dateStr = task.created_at
                    ? new Date(task.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-';
                  const isEven = idx % 2 === 0;

                  return (
                    <tr key={task.id} className={`group transition-colors hover:bg-primary/3 ${isEven ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="w-8 px-4 py-3.5 text-center text-xs font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">
                        {dateStr}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {task.staff?.name || 'Karyawan'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {task.staff?.role || 'Borongan'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {getTaskTypeBadge(task.task_type)}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="font-medium text-slate-800 truncate">
                          {task.products?.name || 'Tugas Umum'}
                        </div>
                        {task.orders && (
                          <div className="mt-0.5 text-[11px] text-primary font-mono font-semibold">
                            {task.orders.order_id}
                            <span className="ml-1 font-sans font-normal text-slate-400">({task.orders.customer_name})</span>
                          </div>
                        )}
                        {task.notes && (
                          <div className="mt-0.5 text-[11px] text-slate-400 italic truncate">
                            {task.notes}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <span className="font-bold text-slate-900">{task.qty}</span>
                        <span className="ml-1 text-xs font-normal text-muted-foreground">pcs</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs text-muted-foreground">
                        {formatIDR(task.rate_per_unit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right bg-primary/3">
                        <span className="font-black text-slate-900">{formatIDR(task.total_wage)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-center">
                        {getStatusBadge(task.status)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {task.status === 'pending' && (
                            <button
                              disabled={updatingId === task.id}
                              onClick={() => handleStatusChange(task.id, 'completed')}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
                              title="Tandai pengerjaan selesai agar masuk hitungan payroll"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Selesai
                            </button>
                          )}

                          {task.status === 'completed' && (
                            <button
                              disabled={updatingId === task.id}
                              onClick={() => handleStatusChange(task.id, 'pending')}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
                              title="Kembalikan ke status Sedang Dikerjakan"
                            >
                              <Clock className="h-3 w-3" />
                            </button>
                          )}

                          {task.status !== 'paid' && (
                            <>
                              <button
                                onClick={() => onEditTask(task)}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-primary hover:bg-primary/8 transition"
                                title="Edit tugas"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteTask(task)}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Hapus tugas"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}

                          {task.status === 'paid' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Lunas
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
