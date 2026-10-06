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
import Button from '../ui/button';
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
          <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning border border-warning">
            <Scissors className="h-3 w-3" /> Potong (Cutting)
          </span>
        );
      case 'sewing':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
            <FileText className="h-3 w-3" /> Jahit (Sewing)
          </span>
        );
      case 'finishing':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
            Finishing / QC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground border border-border">
            Lainnya
          </span>
        );
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft/70 px-2.5 py-0.5 text-xs font-medium text-warning border border-warning">
            <Clock className="h-3 w-3" /> Sedang Dikerjakan
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/70 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
            <CheckCircle2 className="h-3 w-3 text-primary" /> Selesai (Siap Bayar)
          </span>
        );
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft/70 px-2.5 py-0.5 text-xs font-semibold text-success border border-success">
            <Coins className="h-3 w-3 text-success" /> Sudah Terbayar
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-5">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-soft transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold  text-muted-foreground">
              Sedang Dikerjakan
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 break-words text-xl font-bold tabular-nums text-foreground">{formatIDR(stats.pendingTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.pendingCount} tugas dalam proses pengerjaan
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-soft transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold  text-primary">
              Selesai (Siap Masuk Payroll)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 break-words text-xl font-bold tabular-nums text-primary">{formatIDR(stats.completedTotal)}</p>
          <p className="mt-1 text-xs text-primary">
            {stats.completedCount} tugas selesai, akan dicairkan saat payroll Sabtu
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-soft transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold  text-success">
              Sudah Dicairkan / Dibayar
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 break-words text-xl font-bold tabular-nums text-success">{formatIDR(stats.paidTotal)}</p>
          <p className="mt-1 text-xs text-success">
            {stats.paidCount} tugas telah lunas dibayarkan
          </p>
        </div>
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-0 w-full flex-1 sm:min-w-[220px] sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              aria-label="Cari tugas borongan"
              placeholder="Cari tukang, produk, no SPK/order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Type Filter */}
          <select
            aria-label="Jenis pekerjaan"
            value={taskTypeFilter}
            onChange={(e) => setTaskTypeFilter(e.target.value as any)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Semua Jenis Pekerjaan</option>
            <option value="cutting">Potong (Cutting)</option>
            <option value="sewing">Jahit (Sewing)</option>
            <option value="finishing">Finishing / QC</option>
            <option value="other">Lainnya</option>
          </select>
        </div>

        <Button
          onClick={onNewTask}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
          Catat Tugas Borongan
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1" role="group" aria-label="Status pekerjaan borongan">
        {[
          { id: 'all' as const, label: 'Semua', count: stats.totalCount },
          { id: 'completed' as const, label: 'Siap Bayar', count: stats.completedCount },
          { id: 'pending' as const, label: 'Sedang Proses', count: stats.pendingCount },
          { id: 'paid' as const, label: 'Sudah Dibayar', count: stats.paidCount },
        ].map(({ id, label, count }) => (
          <Button key={id} variant={statusFilter === id ? 'default' : 'ghost'} size="sm" aria-pressed={statusFilter === id} onClick={() => setStatusFilter(id)} className="h-8 shrink-0 px-3 text-xs">{label} ({count})</Button>
        ))}
      </div>

      {/* Tasks Table */}
      <div className="rounded-lg border border-border bg-card shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat data pekerjaan borongan...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">Tidak ada data tugas borongan ditemukan</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || statusFilter !== 'all' || taskTypeFilter !== 'all'
                ? 'Coba sesuaikan kata kunci pencarian atau filter Anda.'
                : 'Klik tombol "Catat Tugas Borongan" untuk menambahkan pekerjaan penjahit atau tukang potong.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm tabular-nums">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold text-muted-foreground ">
                <tr>
                  <th className="w-8 px-4 py-3 text-center text-muted-foreground">#</th>
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
              <tbody className="divide-y divide-border bg-card">
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
                    <tr key={task.id} className={`group transition-colors hover:bg-muted/40 ${isEven ? 'bg-card' : 'bg-muted/40'}`}>
                      <td className="w-8 px-4 py-3.5 text-center text-xs font-medium text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">
                        {dateStr}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground leading-tight">
                          {task.staff?.name || 'Karyawan'}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {task.staff?.role || 'Borongan'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {getTaskTypeBadge(task.task_type)}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="font-medium text-foreground truncate">
                          {task.products?.name || 'Tugas Umum'}
                        </div>
                        {task.orders && (
                          <div className="mt-0.5 text-xs text-primary font-mono font-semibold">
                            {task.orders.order_id}
                            <span className="ml-1 font-sans font-normal text-muted-foreground">({task.orders.customer_name})</span>
                          </div>
                        )}
                        {task.notes && (
                          <div className="mt-0.5 text-xs text-muted-foreground italic truncate">
                            {task.notes}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <span className="font-bold text-foreground">{task.qty}</span>
                        <span className="ml-1 text-xs font-normal text-muted-foreground">pcs</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs text-muted-foreground">
                        {formatIDR(task.rate_per_unit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right bg-accent/40">
                        <span className="font-bold text-foreground">{formatIDR(task.total_wage)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-center">
                        {getStatusBadge(task.status)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {task.status === 'pending' && (
                            <Button
                              disabled={updatingId === task.id}
                              onClick={() => handleStatusChange(task.id, 'completed')}
                              variant="outline" size="sm" className="h-8 px-2.5 text-xs"
                              title="Tandai pengerjaan selesai agar masuk hitungan payroll"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Selesai
                            </Button>
                          )}

                          {task.status === 'completed' && (
                            <Button
                              disabled={updatingId === task.id}
                              onClick={() => handleStatusChange(task.id, 'pending')}
                              variant="outline" size="sm" aria-label={`Kembalikan tugas ${task.staff?.name || "karyawan"} ke sedang proses`} className="h-8 w-8 p-0"
                              title="Kembalikan ke status Sedang Dikerjakan"
                            >
                              <Clock className="h-3 w-3" />
                            </Button>
                          )}

                          {task.status !== 'paid' && (
                            <>
                              <Button
                                onClick={() => onEditTask(task)}
                                variant="ghost" size="sm" aria-label={`Edit tugas ${task.staff?.name || "karyawan"}`} className="h-8 w-8 p-0"
                                title="Edit tugas"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                onClick={() => onDeleteTask(task)}
                                variant="ghost" size="sm" aria-label={`Hapus tugas ${task.staff?.name || "karyawan"}`} className="h-8 w-8 p-0 text-destructive"
                                title="Hapus tugas"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          {task.status === 'paid' && (
                            <span className="inline-flex items-center gap-1 text-xs text-success font-semibold">
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
