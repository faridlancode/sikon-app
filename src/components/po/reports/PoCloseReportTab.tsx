import React, { useState, useEffect } from 'react';
import {
  Lock,
  Printer,
  FileDown,
  CalendarRange,
  RotateCcw,
  AlertTriangle,
  Scissors,
  CheckCircle2,
  Package,
  Layers,
  ShoppingBag,
  DollarSign,
  User,
  Activity,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { usePoReports } from '../../../hooks/usePoReports';
import { usePoBatches } from '../../../hooks/usePoBatches';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID } from '../../../utils/dateHelpers';
import DocumentPreviewModal from '../../documents/DocumentPreviewModal';
import PoCloseReportPrintTemplate from './PoCloseReportPrintTemplate';
import PoProductionProgressPrintTemplate from './PoProductionProgressPrintTemplate';
import SalesCategoryMatrixTable from './SalesCategoryMatrixTable';
import { ReopenPoModal } from '../ReopenPoModal';
import { getPoLabel, formatPoDateRange } from '../poHelpers';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { downloadPoCloseReportPdf } from '../../../lib/pdf/poCloseReportPdf';

export default function PoCloseReportTab() {
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [activeSubView, setActiveSubView] = useState<'order' | 'progress'>('order');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPrintProgressOpen, setIsPrintProgressOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { batches, loadingBatches, fetchBatches, reopenPo } = usePoBatches();
  const { closeReport, loadingClose, reportError, fetchCloseReport } = usePoReports();
  const { profile } = useCompanySettings();

  async function handleDownloadPdf() {
    if (!closeReport) return;
    try {
      setDownloadingPdf(true);
      await downloadPoCloseReportPdf(closeReport, profile);
    } catch (err) {
      console.error('Gagal mengunduh PDF laporan close:', err);
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Load list of batches on mount
  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Default to first closed batch or first batch when batches are loaded
  useEffect(() => {
    if (batches.length > 0 && !selectedBatchId) {
      const closed = batches.find((b) => b.status === 'closed');
      const targetId = closed ? closed.id : batches[0].id;
      setSelectedBatchId(targetId);
    }
  }, [batches, selectedBatchId]);

  // Fetch report whenever selectedBatchId changes
  useEffect(() => {
    if (selectedBatchId) {
      fetchCloseReport(selectedBatchId);
    }
  }, [selectedBatchId, fetchCloseReport]);

  const handleReopenSuccess = async () => {
    await fetchBatches();
    if (selectedBatchId) {
      await fetchCloseReport(selectedBatchId);
    }
  };

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  const snapshot = closeReport?.close_snapshot;
  const live = closeReport?.live_status;

  return (
    <div className="space-y-6">
      {/* Top Filter & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Pilih Batch PO:</span>
          </div>

          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            disabled={loadingBatches}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} ({getPoLabel(b)}) - {b.status.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {selectedBatch?.status === 'closed' && !selectedBatch.is_legacy && (
            <button
              onClick={() => setIsReopenModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Buka Kembali PO</span>
            </button>
          )}

          <button
            onClick={() => {
              if (activeSubView === 'order') {
                setIsPrintModalOpen(true);
              } else {
                setIsPrintProgressOpen(true);
              }
            }}
            disabled={!snapshot || loadingClose}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>
              {activeSubView === 'order' ? 'Pratinjau Cetak' : 'Pratinjau Progres'}
            </span>
          </button>

          {activeSubView === 'order' && (
            <button
              onClick={handleDownloadPdf}
              disabled={!closeReport || loadingClose || downloadingPdf}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {downloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              <span>{downloadingPdf ? 'Membuat PDF...' : 'Download PDF'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {reportError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{reportError}</span>
        </div>
      )}

      {/* Loading state */}
      {loadingClose && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-xs font-medium">Memuat data laporan penutupan PO...</span>
        </div>
      )}

      {/* When Batch is still OPEN */}
      {!loadingClose && closeReport && !closeReport.is_closed && (
        <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-8 text-center space-y-2">
          <Lock className="h-8 w-8 mx-auto text-amber-600 dark:text-amber-400 opacity-60" />
          <h3 className="text-sm font-bold text-foreground">
            Batch {closeReport.batch.code} Masih Terbuka (Open)
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Laporan Close akan dibekukan ke snapshot permanen ketika PO ditutup di tab &quot;PO Berjalan&quot;.
            Untuk memantau aktivitas sementara, silakan gunakan tab Laporan Harian atau tab PO Berjalan.
          </p>
        </div>
      )}

      {/* When Batch is CLOSED and has Snapshot */}
      {!loadingClose && closeReport && closeReport.is_closed && snapshot && (
        <>
          {/* Header Meta Snapshot */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarRange className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-foreground">
                      {snapshot.batch?.name || closeReport.batch.name || closeReport.batch.code}
                    </h2>
                    {(snapshot.batch?.name || closeReport.batch.name) && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ({closeReport.batch.code})
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Closed Snapshot v{snapshot.schema_version}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Periode PO: {formatPoDateRange(closeReport.batch.start_date, closeReport.batch.end_date)}
                  </p>
                </div>
              </div>

              <div className="text-xs sm:text-right text-muted-foreground">
                Ditutup pada:{' '}
                <span className="font-semibold text-foreground">
                  {new Date(snapshot.closed_at).toLocaleString('id-ID', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="block text-[11px]">
                  Oleh: {closeReport.batch.closed_by_name || 'Admin'}
                </span>
              </div>
            </div>

            {snapshot.is_early && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Ditutup Lebih Awal:</strong> {snapshot.close_early_reason || 'Tanpa alasan khusus'}
                </span>
              </div>
            )}

            {snapshot.close_note && (
              <p className="text-xs text-muted-foreground italic">
                Catatan: &ldquo;{snapshot.close_note}&rdquo;
              </p>
            )}
          </div>

          {/* Sub-view Navigation Toggle */}
          <div className="flex border-b border-border gap-2">
            <button
              onClick={() => setActiveSubView('order')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeSubView === 'order'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Ringkasan Order & Komersial</span>
            </button>
            <button
              onClick={() => setActiveSubView('progress')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeSubView === 'progress'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Scissors className="h-4 w-4" />
              <span>Progres Produksi Fisik</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary font-bold">
                {snapshot.production_progress_orders?.length ?? snapshot.summary.total_orders}
              </span>
            </button>
          </div>

          {/* Sub-view 1: Ringkasan Order & Komersial */}
          {activeSubView === 'order' && (
            <div className="space-y-6">
              {/* 1. Ringkasan Komersial Saat Close (Snapshot Beku) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Ringkasan Komersial Saat Close (Snapshot Dibekukan)
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Order & Pcs */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Total Pesanan</span>
                  <ShoppingBag className="h-4 w-4 text-blue-500" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-foreground font-mono">
                    {snapshot.summary.total_orders} <span className="text-xs font-normal text-muted-foreground">order</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {snapshot.summary.total_pcs} pcs (Satuan: {snapshot.summary.unit_pcs}, Prioritas: {snapshot.summary.priority_pcs})
                  </div>
                  {snapshot.summary?.quota_qty != null && snapshot.summary.quota_qty > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Kuota: <strong className="font-mono text-foreground">{snapshot.summary.quota_qty} pcs</strong> ({snapshot.summary.quota_used_pct ?? 0}% terisi)
                    </div>
                  )}
                </div>
              </div>

              {/* Nilai Pesanan */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Nilai Pesanan (Booking)</span>
                  <DollarSign className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-foreground font-mono">
                    {formatIDR(snapshot.summary.total_price)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Ongkir: {formatIDR(snapshot.summary.total_ongkir)}
                  </div>
                </div>
              </div>

              {/* Terbayar saat close */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Kas Diterima Saat Close</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatIDR(snapshot.summary.total_paid)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    DP & pelunasan hingga saat close
                  </div>
                </div>
              </div>

              {/* Piutang saat close */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Sisa Piutang Saat Close</span>
                  <AlertCircle className="h-4 w-4 text-rose-500" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-rose-600 dark:text-rose-400 font-mono">
                    {formatIDR(snapshot.summary.total_remaining)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Belum dilunasi pelanggan saat close
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Kondisi Terkini (Per Sekarang / Live) */}
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-primary/20 pb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Kondisi Terkini (Per Sekarang)
                </h3>
              </div>
              <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Data Live Terkini
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Payment Live */}
              <div className="space-y-2.5 rounded-lg border border-border bg-card p-3.5">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>Pelunasan Pembayaran Sekarang</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {live?.payment?.fully_paid_orders ?? 0} dari {snapshot.summary.total_orders} lunas
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Kas Masuk Sekarang:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                      {formatIDR(live?.payment?.paid_amount ?? snapshot.summary.total_paid)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sisa Piutang Sekarang:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 font-mono text-sm">
                      {formatIDR(live?.payment?.remaining_receivable ?? snapshot.summary.total_remaining)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Physical Production Live */}
              <div className="space-y-2.5 rounded-lg border border-border bg-card p-3.5">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>Progres Fisik Produksi</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Target: {live?.production?.total_order_pcs ?? snapshot.summary.total_pcs} pcs
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Potong */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Scissors className="h-3 w-3" /> Potong Selesai
                      </span>
                      <span className="font-mono font-medium">
                        {live?.production?.cutting_completed_pcs ?? 0} pcs ({live?.production?.cutting_pct ?? 0}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, live?.production?.cutting_pct ?? 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Jahit */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3" /> Jahit Selesai
                      </span>
                      <span className="font-mono font-medium">
                        {live?.production?.sewing_completed_pcs ?? 0} pcs ({live?.production?.sewing_pct ?? 0}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${Math.min(100, live?.production?.sewing_pct ?? 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* QC */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" /> QC Lolos
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {live?.production?.qc_passed_pcs ?? 0} pcs ({live?.production?.qc_pct ?? 0}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, live?.production?.qc_pct ?? 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

              {/* 2. Rincian Pesanan per Sales & Kategori (Matrix Cross-tab) */}
              <SalesCategoryMatrixTable
                matrix={snapshot.sales_category_matrix}
                title="Rincian Pesanan per Sales & Kategori (Saat Close)"
                subtitle="Data dibekukan saat penutupan PO"
                isPrint={false}
                showRevenue={true}
              />
            </div>
          )}

          {/* Sub-view 2: Progres Produksi Fisik (Khusus PO Closed) */}
          {activeSubView === 'progress' && (
            <div className="space-y-6">
              {/* Progress Metric Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Total Pesanan Produksi</span>
                    <Package className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-bold text-foreground font-mono">
                      {snapshot.summary.total_pcs}{' '}
                      <span className="text-xs font-normal text-muted-foreground">pcs</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {snapshot.summary.total_orders} order Pre-Order
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-950/20 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-800 dark:text-blue-300">Potong Selesai</span>
                    <Scissors className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-bold text-blue-700 dark:text-blue-400 font-mono">
                      {live?.production?.cutting_completed_pcs ?? 0} / {snapshot.summary.total_pcs}{' '}
                      <span className="text-xs font-normal text-blue-600 dark:text-blue-300">pcs</span>
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                      {live?.production?.cutting_pct ?? 0}% selesai
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-indigo-800 dark:text-indigo-300">Jahit Selesai</span>
                    <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                      {live?.production?.sewing_completed_pcs ?? 0} / {snapshot.summary.total_pcs}{' '}
                      <span className="text-xs font-normal text-indigo-600 dark:text-indigo-300">pcs</span>
                    </div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                      {live?.production?.sewing_pct ?? 0}% selesai
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">QC Lolos (Siap Kirim)</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      {live?.production?.qc_passed_pcs ?? 0} / {snapshot.summary.total_pcs}{' '}
                      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-300">pcs</span>
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                      {live?.production?.qc_pct ?? 0}% lolos QC
                    </div>
                  </div>
                </div>
              </div>

              {/* Orders Table Sorted by total_pcs DESC */}
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border bg-muted/40 px-4 py-3 gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Daftar Order Produksi (Urut Kuantitas Terbanyak)
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Prioritas pengerjaan diurutkan dari pemesanan terbesar ke terkecil
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Total: {snapshot.production_progress_orders?.length ?? 0} pesanan
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                      <tr>
                        <th className="py-2.5 px-3 text-center font-medium w-10">No</th>
                        <th className="py-2.5 px-3 text-left font-medium">No. Order</th>
                        <th className="py-2.5 px-3 text-left font-medium">Pelanggan</th>
                        <th className="py-2.5 px-3 text-left font-medium">Item Produk</th>
                        <th className="py-2.5 px-3 text-left font-medium">Sales</th>
                        <th className="py-2.5 px-3 text-right font-bold text-foreground bg-primary/5">Qty (pcs)</th>
                        <th className="py-2.5 px-3 text-center font-medium">Potong</th>
                        <th className="py-2.5 px-3 text-center font-medium">Jahit</th>
                        <th className="py-2.5 px-3 text-center font-medium">QC Lolos</th>
                        <th className="py-2.5 px-3 text-center font-medium">Status Produksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {(!snapshot.production_progress_orders || snapshot.production_progress_orders.length === 0) ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-muted-foreground">
                            Tidak ada data pesanan pada Batch PO ini.
                          </td>
                        </tr>
                      ) : (
                        snapshot.production_progress_orders.map((o, idx) => (
                          <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-foreground">{o.order_id}</td>
                            <td className="py-2.5 px-3 font-medium text-foreground">{o.customer_name}</td>
                            <td className="py-2.5 px-3 max-w-[200px] truncate text-muted-foreground" title={o.items_summary}>
                              {o.items_summary || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">{o.sales_name || '-'}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground text-sm bg-primary/5">
                              {o.total_pcs}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                  o.cutting_status === 'done' || o.cutting_completed_pcs >= o.total_pcs
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold'
                                    : o.cutting_completed_pcs > 0
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {o.cutting_completed_pcs}/{o.total_pcs}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                  o.sewing_status === 'done' || o.sewing_completed_pcs >= o.total_pcs
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold'
                                    : o.sewing_completed_pcs > 0
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {o.sewing_completed_pcs}/{o.total_pcs}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                  o.qc_status === 'done' || o.qc_passed_pcs >= o.total_pcs
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold'
                                    : o.qc_passed_pcs > 0
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {o.qc_passed_pcs}/{o.total_pcs}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-foreground">
                                {o.production_status || 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {snapshot.production_progress_orders && snapshot.production_progress_orders.length > 0 && (
                      <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
                        <tr>
                          <td colSpan={5} className="py-3 px-3 text-left uppercase text-xs font-black text-foreground">
                            TOTAL FISIK PRODUKSI
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-foreground text-sm bg-primary/10">
                            {snapshot.summary.total_pcs}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-foreground">
                            {live?.production?.cutting_completed_pcs ?? 0} pcs
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-foreground">
                            {live?.production?.sewing_completed_pcs ?? 0} pcs
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {live?.production?.qc_passed_pcs ?? 0} pcs
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Printable Modal: Laporan Close PO */}
          <DocumentPreviewModal
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            title="Pratinjau Laporan Close PO"
            documentType="Laporan Close PO"
            documentNo={closeReport.batch.code}
            orientation="landscape"
          >
            {(printMode) => (
              <PoCloseReportPrintTemplate report={closeReport} printMode={printMode} />
            )}
          </DocumentPreviewModal>

          {/* Printable Modal: Laporan Progres Produksi */}
          <DocumentPreviewModal
            isOpen={isPrintProgressOpen}
            onClose={() => setIsPrintProgressOpen(false)}
            title="Pratinjau Laporan Progres Produksi"
            documentType="Laporan Progres Produksi"
            documentNo={closeReport.batch.code}
            orientation="landscape"
          >
            {(printMode) => (
              <PoProductionProgressPrintTemplate report={closeReport} printMode={printMode} />
            )}
          </DocumentPreviewModal>

          {/* Reopen Modal */}
          {selectedBatch && (
            <ReopenPoModal
              isOpen={isReopenModalOpen}
              onClose={() => setIsReopenModalOpen(false)}
              batch={selectedBatch}
              onConfirm={async (params) => {
                const res = await reopenPo(params);
                if (res.success) {
                  await handleReopenSuccess();
                }
                return res;
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
