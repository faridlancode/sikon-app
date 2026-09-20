import React, { useState } from 'react';
import {
  Coins,
  Scissors,
  History,
  Plus,
  CheckCircle2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/card';
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
      <div className="space-y-6">
        {/* Notification Banner */}
        {notification && (
          <div
            className={`flex items-center gap-3 rounded-xl p-4 text-sm font-medium transition-all ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm'
                : 'bg-rose-50 text-rose-800 border border-rose-200 shadow-sm'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <Coins className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-white rounded-t-xl px-4 pt-2 shadow-xs">
          <button
            onClick={() => setActiveTab('weekly')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === 'weekly'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-4 w-4" />
            Payroll Mingguan (Sabtu)
          </button>

          <button
            onClick={() => setActiveTab('piecework')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === 'piecework'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Scissors className="h-4 w-4" />
            Pekerjaan Borongan
            {tasks.filter((t) => t.status === 'completed').length > 0 && (
              <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                {tasks.filter((t) => t.status === 'completed').length} Siap Bayar
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="h-4 w-4" />
            Riwayat Penggajian
            {payrolls.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {payrolls.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div>
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
