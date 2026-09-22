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
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import SewingQueueTab from '../components/worklog/SewingQueueTab';
import SewingAssignmentsTab from '../components/worklog/SewingAssignmentsTab';
import QcCheckPanel from '../components/worklog/QcCheckPanel';
import ManualPayPanel from '../components/worklog/ManualPayPanel';
import CuttingAssignTab from '../components/worklog/CuttingAssignTab';
import CuttingReportForm from '../components/worklog/CuttingReportForm';
import CuttingReportHistory from '../components/worklog/CuttingReportHistory';

import { useSewingWorklog } from '../hooks/useSewingWorklog';
import { useCuttingWorklog } from '../hooks/useCuttingWorklog';
import { useStaff } from '../hooks/useStaff';

type MainTab = 'sewing_queue' | 'sewing_assignments' | 'qc_check' | 'manual_pay' | 'cutting';
type CuttingSubTab = 'assign' | 'report' | 'history';

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
    refetchAll: refetchSewing,
  } = useSewingWorklog();

  const {
    cuttingAssignments,
    unassignedOrders,
    cuttingReports,
    loading: cuttingLoading,
    error: cuttingError,
    fetchCuttingAssignments,
    fetchUnassignedOrders,
    fetchCuttingReports,
    assignCuttingOrder,
    submitCuttingReport,
    refetchAll: refetchCutting,
  } = useCuttingWorklog();

  const { activeStaff } = useStaff();

  useEffect(() => {
    fetchSewingPool();
    fetchAssignments();
    fetchPendingTasks();
    fetchCuttingAssignments();
    fetchUnassignedOrders();
    fetchCuttingReports();
  }, [
    fetchSewingPool,
    fetchAssignments,
    fetchPendingTasks,
    fetchCuttingAssignments,
    fetchUnassignedOrders,
    fetchCuttingReports,
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

  const handleAssignCutting = async (orderId: string, staffId: string, notes: string | null) => {
    try {
      await assignCuttingOrder(orderId, staffId, notes);
      showNotification('success', 'Order berhasil di-assign ke tukang potong');
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal assign order');
      throw e;
    }
  };

  const handleSubmitCuttingReport = async (
    staffId: string,
    periodStart: string,
    periodEnd: string,
    lines: any[],
    notes: string | null
  ) => {
    try {
      const res = await submitCuttingReport(staffId, periodStart, periodEnd, lines, notes);
      showNotification('success', `Laporan potong berhasil disimpan (${res.total_qty} pcs)`);
      return res;
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal menyimpan laporan potong');
      throw e;
    }
  };

  // Staff lists
  const cuttingStaff = activeStaff.filter(
    (s) => !s.role || s.role.toLowerCase().includes('potong') || s.role.toLowerCase().includes('cutting') || s.role.toLowerCase().includes('produksi')
  );
  // Fallback to activeStaff if none with role potong
  const availableCuttingStaff = cuttingStaff.length > 0 ? cuttingStaff : activeStaff;

  const totalPoolQty = sewingPool.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const activeAssignmentsCount = assignments.filter((a) => a.status !== 'completed').length;
  const pendingManualPayCount = pendingTasks.length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Worklog Produksi</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Kelola distribusi jahit otomatis, QC, susulan upah, serta alokasi & setoran potong mingguan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={sewingLoading || cuttingLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-muted transition disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${sewingLoading || cuttingLoading ? 'animate-spin' : ''}`}
              />
              Segarkan
            </button>
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

        {/* Main Tabs */}
        <div className="border-b border-border">
          <nav className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('sewing_queue')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'sewing_queue'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Layers className="h-4 w-4" />
              Antrian Jahit
              {sewingPool.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">
                  {sewingPool.length} ({totalPoolQty} pcs)
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('sewing_assignments')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'sewing_assignments'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Users className="h-4 w-4" />
              Beban Penjahit
              {activeAssignmentsCount > 0 && (
                <span className="ml-1 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-semibold">
                  {activeAssignmentsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('qc_check')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'qc_check'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              Pemeriksaan QC
            </button>

            <button
              onClick={() => setActiveTab('manual_pay')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'manual_pay'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Banknote className="h-4 w-4" />
              Susulan Cash
              {pendingManualPayCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
                  {pendingManualPayCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('cutting')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'cutting'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Scissors className="h-4 w-4" />
              Worklog Potong
              {unassignedOrders.length > 0 && (
                <span className="ml-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-bold">
                  {unassignedOrders.length} antri
                </span>
              )}
            </button>
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
                  Assign Order ({unassignedOrders.length} order antri)
                </button>

                <button
                  onClick={() => setCuttingSubTab('report')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    cuttingSubTab === 'report'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Input Setoran Mingguan
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
                  Riwayat Laporan ({cuttingReports.length})
                </button>
              </div>

              {/* Cutting Subtab Contents */}
              {cuttingSubTab === 'assign' && (
                <CuttingAssignTab
                  cuttingAssignments={cuttingAssignments}
                  unassignedOrders={unassignedOrders}
                  staffList={availableCuttingStaff}
                  loading={cuttingLoading}
                  onAssign={handleAssignCutting}
                />
              )}

              {cuttingSubTab === 'report' && (
                <CuttingReportForm
                  staffList={availableCuttingStaff}
                  cuttingAssignments={cuttingAssignments}
                  loading={cuttingLoading}
                  onSubmit={handleSubmitCuttingReport}
                />
              )}

              {cuttingSubTab === 'history' && (
                <CuttingReportHistory
                  cuttingReports={cuttingReports}
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
