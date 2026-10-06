import React, { useState } from 'react';
import {
  Coins,
  Scissors,
  History,
  Plus,
  CheckCircle2,
  Calendar,
  X,
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
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Coins className="h-4 w-4" /> Administrasi penggajian
        </div>
        {/* Notification Banner */}
        {notification && (
          <div
            className={`flex items-center gap-3 rounded-lg p-4 text-sm font-medium shadow-sm ${
              notification.type === 'success'
                ? 'bg-success-soft text-success border border-success/20'
                : 'bg-destructive-soft text-destructive border border-destructive/20'
            }`}
          >
            {notification.type === 'success' ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive-soft">
                <Coins className="h-4 w-4 text-destructive" />
              </div>
            )}
            <span className="flex-1">{notification.message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNotification(null)}
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-soft" role="group" aria-label="Bagian penggajian">
          {[
            { id: 'weekly' as const, label: 'Payroll Mingguan', icon: Calendar, count: null },
            { id: 'piecework' as const, label: 'Pekerjaan Borongan', icon: Scissors, count: completedTasksCount },
            { id: 'history' as const, label: 'Riwayat Penggajian', icon: History, count: payrolls.length },
          ].map(({ id, label, icon: Icon, count }) => (
            <Button key={id} variant={activeTab === id ? 'default' : 'ghost'} size="sm" aria-pressed={activeTab === id} onClick={() => setActiveTab(id)} className="h-9 shrink-0 gap-2 px-3 text-xs">
              <Icon className="h-4 w-4" />{label}
              {id === 'weekly' && <span className="font-normal opacity-80">(Sabtu)</span>}
              {count !== null && count > 0 && <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${activeTab === id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>{count}</span>}
            </Button>
          ))}
        </div>
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
