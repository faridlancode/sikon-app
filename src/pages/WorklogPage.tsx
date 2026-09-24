import React, { useState, useEffect } from 'react';
import {
  Layers,
  Users,
  CheckSquare,
  Banknote,
  Scissors,
  ClipboardList,
  History,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Button from '../components/ui/button';
import SewingQueueTab from '../components/worklog/SewingQueueTab';
import SewingAssignmentsTab from '../components/worklog/SewingAssignmentsTab';
import QcCheckPanel from '../components/worklog/QcCheckPanel';
import ManualPayPanel from '../components/worklog/ManualPayPanel';
import CuttingAssignTab from '../components/worklog/CuttingAssignTab';
import CuttingReportHistory from '../components/worklog/CuttingReportHistory';

import { useSewingWorklog } from '../hooks/useSewingWorklog';
import { useCuttingWorklog } from '../hooks/useCuttingWorklog';
import { useStaff } from '../hooks/useStaff';

type MainTab = 'sewing_queue' | 'sewing_assignments' | 'qc_check' | 'manual_pay' | 'cutting';
type CuttingSubTab = 'assign' | 'history';

export default function WorklogPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('sewing_queue');
  const [cuttingSubTab, setCuttingSubTab] = useState<CuttingSubTab>('assign');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const {
    sewingPool,
    assignments,
    pendingTasks,
    loading: sewingLoading,
    error: sewingError,
    fetchSewingPool,
    fetchAssignments,
    fetchPendingTasks,
    markReadyForSewing,
    distributeWork,
    recordQcCheck,
    markManualPaid,
    startAssignment,
    startAllAssignments,
    refetchAll: refetchSewing,
  } = useSewingWorklog();

  const {
    cuttingAssignments,
    unassignedItems,
    loading: cuttingLoading,
    error: cuttingError,
    fetchCuttingAssignments,
    fetchUnassignedItems,
    assignCuttingItem,
    markCuttingItemDone,
    refetchAll: refetchCutting,
  } = useCuttingWorklog();

  const { activeStaff } = useStaff();

  useEffect(() => {
    fetchSewingPool();
    fetchAssignments();
    fetchPendingTasks();
    fetchCuttingAssignments();
    fetchUnassignedItems();
  }, [
    fetchSewingPool,
    fetchAssignments,
    fetchPendingTasks,
    fetchCuttingAssignments,
    fetchUnassignedItems,
  ]);

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  }

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchSewing(), refetchCutting()]);
      showNotification('success', 'Data berhasil diperbarui');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal memperbarui data');
    }
  };

  const handleMarkReady = async (ids: string[]) => {
    try {
      await markReadyForSewing(ids);
      showNotification('success', `${ids.length} item berhasil ditandai siap jahit`);
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal menandai item');
      throw e;
    }
  };

  const handleDistribute = async (ids: string[] | null, notes: string | null) => {
    try {
      await distributeWork(ids, notes);
      showNotification('success', 'Pekerjaan jahit berhasil didistribusikan');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal membagikan kerja');
      throw e;
    }
  };

  const handleRecordQc = async (
    assignmentId: string,
    passedQty: number,
    rejectedQty: number,
    notes: string | null
  ) => {
    try {
      await recordQcCheck(assignmentId, passedQty, rejectedQty, notes);
      showNotification('success', 'Hasil pemeriksaan QC berhasil disimpan');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal menyimpan QC');
      throw e;
    }
  };

  const handleMarkManualPaid = async (ids: string[], note: string | null) => {
    try {
      await markManualPaid(ids, note);
      showNotification('success', `${ids.length} tugas berhasil ditandai telah dibayar manual (cash)`);
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal memperbarui status');
      throw e;
    }
  };

  const handleAssignCutting = async (orderItemId: string, staffId: string, notes: string | null) => {
    try {
      await assignCuttingItem(orderItemId, staffId, notes);
      showNotification('success', 'Item berhasil di-assign ke tukang potong');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal assign item potong');
      throw e;
    }
  };

  const handleMarkCuttingDone = async (orderItemId: string, qty: number | null, notes: string | null) => {
    try {
      await markCuttingItemDone(orderItemId, qty, notes);
      showNotification('success', 'Item selesai dipotong. Upah borongan tercatat otomatis.');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal menandai item potong selesai');
      throw e;
    }
  };

  const handleStartAssignment = async (id: string) => {
    try {
      await startAssignment(id);
      showNotification('success', 'Status pengerjaan berhasil diubah ke sedang dikerjakan');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal mengubah status pengerjaan');
      throw e;
    }
  };

  const handleStartAllAssignments = async (staffId?: string) => {
    try {
      await startAllAssignments(staffId);
      showNotification('success', 'Semua penugasan jahit berhasil dimulai');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal memulai penugasan');
      throw e;
    }
  };

  // Staff lists
  const cuttingStaff = activeStaff.filter(
    (s) => !s.role || s.role.toLowerCase().includes('potong') || s.role.toLowerCase().includes('cutting') || s.role.toLowerCase().includes('produksi')
  );
  // Fallback to activeStaff if none with role potong
  const availableCuttingStaff = cuttingStaff.length > 0 ? cuttingStaff : activeStaff;

  const waitingPoolItems = sewingPool.filter(
    (item) => (Number(item.remaining_qty) || Number(item.qty) || 0) > 0
  );
  const totalWaitingPoolQty = sewingPool.reduce(
    (sum, item) => sum + (Number(item.remaining_qty) || Number(item.qty) || 0),
    0
  );
  const activeAssignmentsCount = assignments.filter((a) => a.status !== 'completed').length;
  const pendingManualPayCount = pendingTasks.length;
  const pendingQcQty = assignments
    .filter((assignment) => assignment.status !== 'completed')
    .reduce(
      (sum, assignment) => sum + Math.max(0, Number(assignment.assigned_qty) - Number(assignment.qc_passed_qty)),
      0
    );
  const activeCuttingCount = cuttingAssignments.filter((assignment) => assignment.status === 'assigned').length;

  const tabs = [
    { id: 'sewing_queue' as const, label: 'Antrian Jahit', icon: Layers, count: waitingPoolItems.length },
    { id: 'sewing_assignments' as const, label: 'Beban Penjahit', icon: Users, count: activeAssignmentsCount },
    { id: 'qc_check' as const, label: 'Pemeriksaan QC', icon: CheckSquare, count: pendingQcQty },
    { id: 'manual_pay' as const, label: 'Susulan Cash', icon: Banknote, count: pendingManualPayCount },
    { id: 'cutting' as const, label: 'Worklog Potong', icon: Scissors, count: unassignedItems.length },
  ];

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
              <Activity className="h-3.5 w-3.5" />
              Operasional produksi
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Worklog Produksi</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pantau alur potong, distribusi jahit, pemeriksaan kualitas, dan upah susulan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefresh}
              disabled={sewingLoading || cuttingLoading}
              variant="outline"
              size="sm"
            >
              <RefreshCw
                className={`h-4 w-4 ${sewingLoading || cuttingLoading ? 'animate-spin' : ''}`}
              />
              Segarkan
            </Button>
          </div>
        </div>

        {/* Global Notification */}
        {notification && (
          <div
            className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-medium shadow-sm transition ${
              notification.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Global Errors */}
        {(sewingError || cuttingError) && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{sewingError || cuttingError}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Antrian jahit', value: `${totalWaitingPoolQty} pcs`, detail: `${waitingPoolItems.length} item`, icon: Layers },
            { label: 'Tugas aktif', value: activeAssignmentsCount, detail: 'penugasan jahit', icon: Users },
            { label: 'Menunggu QC', value: `${pendingQcQty} pcs`, detail: 'belum diperiksa', icon: CheckSquare },
            { label: 'Proses potong', value: activeCuttingCount, detail: `${unassignedItems.length} item mengantre`, icon: Scissors },
          ].map(({ label, value, detail, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </div>
                <div className="rounded-md bg-accent p-2 text-accent-foreground"><Icon className="h-4 w-4" /></div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Tabs */}
        <div className="rounded-lg border border-border bg-card p-1 shadow-soft">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Tahapan worklog">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {count > 0 && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${activeTab === id ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === 'sewing_queue' && (
            <SewingQueueTab
              pool={sewingPool}
              loading={sewingLoading}
              onMarkReady={handleMarkReady}
              onDistribute={handleDistribute}
            />
          )}

          {activeTab === 'sewing_assignments' && (
            <SewingAssignmentsTab
              assignments={assignments}
              loading={sewingLoading}
              onStartAssignment={handleStartAssignment}
              onStartAll={handleStartAllAssignments}
            />
          )}

          {activeTab === 'qc_check' && (
            <QcCheckPanel
              assignments={assignments}
              loading={sewingLoading}
              onRecordQc={handleRecordQc}
            />
          )}

          {activeTab === 'manual_pay' && (
            <ManualPayPanel
              tasks={pendingTasks}
              loading={sewingLoading}
              onMarkManualPaid={handleMarkManualPaid}
            />
          )}

          {activeTab === 'cutting' && (
            <div className="space-y-6">
              {/* Cutting Subtabs */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setCuttingSubTab('assign')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    cuttingSubTab === 'assign'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Assign & Potong ({unassignedItems.length} antri)
                </button>

                <button
                  onClick={() => setCuttingSubTab('history')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    cuttingSubTab === 'history'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Riwayat Potong ({cuttingAssignments.filter((a) => a.status === 'done').length})
                </button>
              </div>

              {/* Cutting Subtab Contents */}
              {cuttingSubTab === 'assign' && (
                <CuttingAssignTab
                  cuttingAssignments={cuttingAssignments}
                  unassignedItems={unassignedItems}
                  staffList={availableCuttingStaff}
                  loading={cuttingLoading}
                  onAssign={handleAssignCutting}
                  onMarkDone={handleMarkCuttingDone}
                />
              )}

              {cuttingSubTab === 'history' && (
                <CuttingReportHistory
                  cuttingAssignments={cuttingAssignments}
                  loading={cuttingLoading}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
