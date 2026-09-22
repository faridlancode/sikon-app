import React, { useState } from 'react';
import {
  Coins,
  Scissors,
  History,
  Plus,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Button from '../components/ui/button';
import WeeklyPayrollTab from '../components/payroll/WeeklyPayrollTab';
import PieceworkTasksTab from '../components/payroll/PieceworkTasksTab';
import PayrollHistoryTab from '../components/payroll/PayrollHistoryTab';
import PieceworkTaskModal from '../components/payroll/PieceworkTaskModal';
import { usePayroll } from '../hooks/usePayroll';
import { usePiecework } from '../hooks/usePiecework';
import { useOrders } from '../hooks/useOrders';
import type { PieceworkTask } from '../types';

type PayrollTab = 'weekly' | 'piecework' | 'history';

export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<PayrollTab>('weekly');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PieceworkTask | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const {
    payrolls,
    loading: payrollLoading,
    calculateDraftPayroll,
    createPayroll,
    payPayroll,
    deletePayroll,
    refetch: refetchPayrolls,
  } = usePayroll();

  const { markOrderBonusPaid } = useOrders();

  const {
    tasks,
    loading: tasksLoading,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    refetch: refetchTasks,
  } = usePiecework();

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  }

  function handleOpenNewTask() {
    setEditingTask(null);
    setTaskModalOpen(true);
  }

  function handleOpenEditTask(task: PieceworkTask) {
    setEditingTask(task);
    setTaskModalOpen(true);
  }

  async function handleSaveTask(payload: any) {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        showNotification('success', 'Tugas borongan berhasil diperbarui.');
      } else {
        await createTask(payload);
        showNotification('success', 'Tugas borongan berhasil dicatat.');
      }
      setTaskModalOpen(false);
    } catch (err: any) {
      console.error(err);
      showNotification('error', err.message || 'Gagal menyimpan tugas borongan.');
    }
  }

  async function handleDeleteTask(task: PieceworkTask) {
    if (window.confirm(`Hapus tugas borongan untuk ${task.staff?.name || 'karyawan'}?`)) {
      try {
        await deleteTask(task.id);
        showNotification('success', 'Tugas borongan berhasil dihapus.');
      } catch (err: any) {
        console.error(err);
        showNotification('error', err.message || 'Gagal menghapus tugas borongan.');
      }
    }
  }

  async function handleUpdateStatus(id: string, status: 'pending' | 'completed' | 'paid') {
    try {
      await updateTaskStatus(id, status);
      showNotification(
        'success',
        status === 'completed'
          ? 'Tugas ditandai selesai dan siap masuk hitungan payroll Sabtu.'
          : 'Status tugas berhasil diperbarui.'
      );
    } catch (err: any) {
      console.error(err);
      showNotification('error', err.message || 'Gagal memperbarui status tugas.');
    }
  }

  async function handlePayrollPaidSuccess() {
    showNotification(
      'success',
      'Payroll berhasil dibayarkan! Seluruh tugas borongan telah dikunci dan transaksi otomatis dicatat di Keuangan.'
    );
    await refetchTasks();
    await refetchPayrolls();
    setActiveTab('history');
  }

  const completedTasksCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <AppShell
      title="Penggajian Karyawan"
      subtitle="Sistem upah borongan (penjahit & tukang potong), gaji harian/absensi, serta bonus penjualan sales"
      actions={
        <Button onClick={handleOpenNewTask}>
          <Plus className="h-4 w-4" />
          Catat Tugas Borongan
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Notification Banner */}
        {notification && (
          <div
            className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-medium shadow-sm ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {notification.type === 'success' ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <Coins className="h-4 w-4 text-rose-600" />
              </div>
            )}
            <span className="flex-1">{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 rounded-lg px-1.5 py-0.5 text-xs opacity-50 hover:opacity-80 transition hover:bg-black/5"
              aria-label="Tutup notifikasi"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tabs Card */}
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          {/* Tab Header */}
          <div className="flex items-end border-b border-border bg-slate-50/60 px-4 gap-1">
            {/* Tab: Payroll Mingguan */}
            <button
              onClick={() => setActiveTab('weekly')}
              className={`group relative flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'weekly'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-slate-700'
              }`}
            >
              <Calendar className={`h-4 w-4 ${activeTab === 'weekly' ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} />
              Payroll Mingguan
              <span className="ml-0.5 text-[10px] font-normal opacity-55">(Sabtu)</span>
            </button>

            {/* Tab: Pekerjaan Borongan */}
            <button
              onClick={() => setActiveTab('piecework')}
              className={`group relative flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'piecework'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-slate-700'
              }`}
            >
              <Scissors className={`h-4 w-4 ${activeTab === 'piecework' ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} />
              Pekerjaan Borongan
              {completedTasksCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {completedTasksCount}
                </span>
              )}
            </button>

            {/* Tab: Riwayat Penggajian */}
            <button
              onClick={() => setActiveTab('history')}
              className={`group relative flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'history'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-slate-700'
              }`}
            >
              <History className={`h-4 w-4 ${activeTab === 'history' ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} />
              Riwayat Penggajian
              {payrolls.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-400 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {payrolls.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-5">
            {activeTab === 'weekly' && (
              <WeeklyPayrollTab
                calculateDraftPayroll={calculateDraftPayroll}
                createPayroll={createPayroll}
                payPayroll={payPayroll}
                onPayrollPaidSuccess={handlePayrollPaidSuccess}
                existingPayrolls={payrolls}
                markOrderBonusPaid={markOrderBonusPaid}
              />
            )}

            {activeTab === 'piecework' && (
              <PieceworkTasksTab
                tasks={tasks}
                loading={tasksLoading}
                onNewTask={handleOpenNewTask}
                onEditTask={handleOpenEditTask}
                onUpdateStatus={handleUpdateStatus}
                onDeleteTask={handleDeleteTask}
              />
            )}

            {activeTab === 'history' && (
              <PayrollHistoryTab
                payrolls={payrolls}
                loading={payrollLoading}
                onPayDraft={payPayroll}
                onDeletePayroll={deletePayroll}
              />
            )}
          </div>
        </div>
      </div>

      {/* Task Creation & Edit Modal */}
      <PieceworkTaskModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSave={handleSaveTask}
        editingTask={editingTask}
      />
    </AppShell>
  );
}
