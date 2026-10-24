import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Printer,
  FileDown,
  Calendar,
  Layers,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Info,
  Loader2,
  AlertCircle,
  Truck,
  Scale,
} from 'lucide-react';
import { usePoReports } from '../../../hooks/usePoReports';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID, todayISO } from '../../../utils/dateHelpers';
import DocumentPreviewModal from '../../documents/DocumentPreviewModal';
import PoMonthlyReportPrintTemplate from './PoMonthlyReportPrintTemplate';
import SalesCategoryMatrixTable from './SalesCategoryMatrixTable';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { downloadPoMonthlyReportPdf } from '../../../lib/pdf/poMonthlyReportPdf';

const MONTH_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

export default function PoMonthlyReportTab() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { monthlyReport, loadingMonthly, reportError, fetchMonthlyReport } = usePoReports();
  const { profile } = useCompanySettings();

  async function handleDownloadPdf() {
    if (!monthlyReport) return;
    try {
      setDownloadingPdf(true);
      await downloadPoMonthlyReportPdf(monthlyReport, profile);
    } catch (err) {
      console.error('Gagal mengunduh PDF laporan bulanan:', err);
    } finally {
      setDownloadingPdf(false);
    }
  }

  useEffect(() => {
    fetchMonthlyReport(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth, fetchMonthlyReport]);

  const prevComp = monthlyReport?.previous_month_comparison;

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Pilih Bulan PO:</span>
          </div>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setIsPrintModalOpen(true)}
          disabled={!monthlyReport || loadingMonthly}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Pratinjau Cetak</span>
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={!monthlyReport || loadingMonthly || downloadingPdf}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {downloadingPdf ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          <span>{downloadingPdf ? 'Membuat PDF...' : 'Download PDF'}</span>
        </button>
      </div>

      {/* Error state */}
      {reportError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{reportError}</span>
        </div>
      )}

      {/* Loading state */}
      {loadingMonthly && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-xs font-medium">Memuat data laporan bulanan PO...</span>
        </div>
      )}

      {/* Report Content */}
      {!loadingMonthly && monthlyReport && (
        <>
          {/* Header Info */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  Rekapitulasi PO: {monthlyReport.month_name} {monthlyReport.year}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mencakup {monthlyReport.totals.po_count} Batch PO pada bulan laporan ini.
              </p>
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Orders & Pcs */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total Pesanan Bulan Ini</span>
                <ShoppingBag className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-foreground font-mono">
                  {monthlyReport.totals.order_count} <span className="text-xs font-normal text-muted-foreground">order</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  Total {monthlyReport.totals.total_pcs} pcs dipesan
                </div>
                {monthlyReport.totals.total_quota_qty != null && monthlyReport.totals.total_quota_qty > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Kuota: <strong className="font-mono text-foreground">{monthlyReport.totals.total_quota_qty} pcs</strong> ({monthlyReport.totals.quota_used_pct ?? 0}% terisi)
                  </div>
                )}
              </div>
            </div>

            {/* Nilai Booking */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Nilai Booking Batch PO</span>
                <DollarSign className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-foreground font-mono">
                  {formatIDR(monthlyReport.totals.booking_value)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Terbayar: {formatIDR(monthlyReport.totals.paid_amount)}
                </div>
              </div>
            </div>

            {/* Margin Kotor Estimasi */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Margin Kotor (Estimasi)</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatIDR(monthlyReport.totals.estimated_margin)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  HPP Est: {formatIDR(monthlyReport.totals.hpp_total_estimate)}
                </div>
              </div>
            </div>

            {/* Biaya Langsung PO */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Biaya Operasional Langsung</span>
                <Layers className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <div className="text-sm font-bold text-foreground font-mono">
                  Borongan: {formatIDR(monthlyReport.totals.actual_piecework_wage)}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  Bahan Baku: {formatIDR(monthlyReport.totals.material_purchases)}
                </div>
              </div>
            </div>
          </div>

          {/* Previous Month Comparison Banner */}
          {prevComp && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Perbandingan Terhadap Bulan Lalu ({MONTH_OPTIONS[prevComp.previous_month - 1]?.label} {prevComp.previous_year})
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                {/* Orders Diff */}
                <div className="rounded-lg bg-card border border-border p-3">
                  <span className="text-[11px] text-muted-foreground block">Jumlah Order:</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-base font-bold font-mono text-foreground">
                      {monthlyReport.totals.order_count}
                    </span>
                    <span
                      className={`text-xs font-mono font-medium flex items-center ${
                        prevComp.diff.order_count_diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {prevComp.diff.order_count_diff >= 0 ? '+' : ''}
                      {prevComp.diff.order_count_diff}
                    </span>
                  </div>
                </div>

                {/* Pcs Diff */}
                <div className="rounded-lg bg-card border border-border p-3">
                  <span className="text-[11px] text-muted-foreground block">Total Pcs:</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-base font-bold font-mono text-foreground">
                      {monthlyReport.totals.total_pcs}
                    </span>
                    <span
                      className={`text-xs font-mono font-medium flex items-center ${
                        prevComp.diff.total_pcs_diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {prevComp.diff.total_pcs_diff >= 0 ? '+' : ''}
                      {prevComp.diff.total_pcs_diff}
                    </span>
                  </div>
                </div>

                {/* Booking Value Diff */}
                <div className="rounded-lg bg-card border border-border p-3">
                  <span className="text-[11px] text-muted-foreground block">Nilai Booking PO:</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-sm font-bold font-mono text-foreground">
                      {formatIDR(monthlyReport.totals.booking_value)}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-medium ${
                        prevComp.diff.booking_value_diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {prevComp.diff.booking_value_diff >= 0 ? '+' : ''}
                      {formatIDR(prevComp.diff.booking_value_diff)}
                    </span>
                  </div>
                </div>

                {/* Margin Diff */}
                <div className="rounded-lg bg-card border border-border p-3">
                  <span className="text-[11px] text-muted-foreground block">Margin Kotor Est.:</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {formatIDR(monthlyReport.totals.estimated_margin)}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-medium ${
                        prevComp.diff.estimated_margin_diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {prevComp.diff.estimated_margin_diff >= 0 ? '+' : ''}
                      {formatIDR(prevComp.diff.estimated_margin_diff)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rincian Pesanan per Sales & Kategori (Matrix Cross-tab Bulanan) */}
          <SalesCategoryMatrixTable
            matrix={monthlyReport.sales_category_matrix}
            title={`Rincian Pesanan per Sales & Kategori (${monthlyReport.month_name} ${monthlyReport.year})`}
            subtitle="Agregasi seluruh batch PO pada bulan laporan"
            isPrint={false}
            showRevenue={true}
          />

          {/* Per-PO Breakdown Table */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Rincian Kinerja per Batch PO
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Performa operasional, estimasi laba kotor, upah borongan, dan pengeluaran bahan
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {monthlyReport.po_batches.length} PO terdaftar
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium">Batch PO</th>
                    <th className="py-2.5 px-3 text-center font-medium">Status</th>
                    <th className="py-2.5 px-3 text-right font-medium">Kuota</th>
                    <th className="py-2.5 px-3 text-right font-medium">Order / Pcs</th>
                    <th className="py-2.5 px-3 text-right font-medium">Nilai Booking</th>
                    <th className="py-2.5 px-3 text-right font-medium">Kas Terbayar</th>
                    <th className="py-2.5 px-3 text-right font-medium">Terkirim</th>
                    <th className="py-2.5 px-3 text-right font-medium">Margin (Est.)</th>
                    <th className="py-2.5 px-3 text-right font-medium">Borongan</th>
                    <th className="py-2.5 px-3 text-right font-medium">Bahan Baku</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {monthlyReport.po_batches.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground">
                        Tidak ada Batch PO yang terdaftar pada bulan ini.
                      </td>
                    </tr>
                  ) : (
                    monthlyReport.po_batches.map((po) => (
                      <tr key={po.batch_id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-foreground block">{po.name || po.code}</span>
                          {po.name && po.name !== po.code && (
                            <span className="font-mono text-[10px] text-muted-foreground block">{po.code}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground block">
                            {formatDateID(po.start_date)} – {formatDateID(po.end_date)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              po.status === 'open'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {po.quota_qty != null && po.quota_qty > 0 ? (
                            <span>
                              {po.quota_qty} pcs
                              <span
                                className={`block text-[10px] font-medium ${
                                  (po.quota_used_pct ?? 0) >= 100
                                    ? 'text-destructive font-bold'
                                    : (po.quota_used_pct ?? 0) >= 90
                                    ? 'text-amber-600 font-semibold'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                ({po.quota_used_pct ?? 0}%)
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                          {po.order_count} / {po.total_pcs}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                          {formatIDR(po.booking_value)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {formatIDR(po.paid_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                          {po.shipped_order_count} order ({formatIDR(po.shipped_order_value)})
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                          {formatIDR(po.estimated_margin)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                          {formatIDR(po.actual_piecework_wage)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                          {formatIDR(po.material_purchases)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t-2 border-border font-bold bg-muted/40">
                  <tr>
                    <td className="py-3 px-3 uppercase text-foreground font-bold" colSpan={2}>
                      Total Bulan Ini:
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {monthlyReport.totals.total_quota_qty != null && monthlyReport.totals.total_quota_qty > 0 ? (
                        <span>
                          {monthlyReport.totals.total_quota_qty} pcs
                          <span className="block text-[10px]">
                            ({monthlyReport.totals.quota_used_pct ?? 0}%)
                          </span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {monthlyReport.totals.order_count} / {monthlyReport.totals.total_pcs}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-foreground font-bold">
                      {formatIDR(monthlyReport.totals.booking_value)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatIDR(monthlyReport.totals.paid_amount)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {monthlyReport.totals.shipped_order_count} ({formatIDR(monthlyReport.totals.shipped_order_value)})
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                      {formatIDR(monthlyReport.totals.estimated_margin)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatIDR(monthlyReport.totals.actual_piecework_wage)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatIDR(monthlyReport.totals.material_purchases)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Item Tanpa Relasi PO (Borongan Tanpa Order & Pembelian Tanpa PO) */}
          {((monthlyReport.unlinked_piecework_wage > 0) || (Number(monthlyReport.unlinked_material_purchases || 0) > 0)) && (
            <div className="space-y-2">
              {monthlyReport.unlinked_piecework_wage > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <strong>Upah Borongan (Tidak Terkait PO):</strong> Ditemukan upah borongan sebesar{' '}
                    <span className="font-mono font-bold text-foreground">
                      {formatIDR(monthlyReport.unlinked_piecework_wage)}
                    </span>{' '}
                    yang tidak memiliki nomor order (tidak terhubung ke PO tertentu) sehingga tidak dialokasikan ke tabel PO di atas.
                  </span>
                </div>
              )}

              {Number(monthlyReport.unlinked_material_purchases || 0) > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <strong>Pembelian Bahan Baku (Tidak Terkait PO):</strong> Ditemukan belanja bahan sebesar{' '}
                    <span className="font-mono font-bold text-foreground">
                      {formatIDR(Number(monthlyReport.unlinked_material_purchases))}
                    </span>{' '}
                    dari nota SPJ / Supplier Purchase umum yang tidak ditautkan ke Batch PO mana pun pada bulan ini.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Blok Rekonsiliasi Jurnal Akuntansi */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Rekonsiliasi Pengakuan Pendapatan Jurnal (Bulan Kalender)
                </h3>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Akun Jurnal: 4-1000 & 4-1100
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-lg border border-border p-3 bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">
                  Pendapatan Diakui di Jurnal:
                </span>
                <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                  {formatIDR(monthlyReport.reconciliation.total_recognized_revenue)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  4-1000: {formatIDR(monthlyReport.reconciliation.recognized_revenue_4_1000)} | 4-1100: {formatIDR(monthlyReport.reconciliation.recognized_revenue_4_1100)}
                </span>
              </div>

              <div className="rounded-lg border border-border p-3 bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">
                  Total Booking Batch PO:
                </span>
                <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                  {formatIDR(monthlyReport.totals.booking_value)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Total nilai order masuk pada Batch PO bulan laporan ini
                </span>
              </div>

              <div className="rounded-lg border border-border p-3 bg-muted/20">
                <span className="text-muted-foreground block text-[11px]">
                  Selisih Booking vs Jurnal:
                </span>
                <span className="text-base font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                  {formatIDR(monthlyReport.reconciliation.booking_value_difference)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Perbedaan waktu pengakuan (order vs kirim)
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium text-foreground mb-0.5">Catatan Rekonsiliasi:</p>
                  <p>{monthlyReport.reconciliation.notes}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Cetak PDF */}
          <DocumentPreviewModal
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            title="Pratinjau Laporan Bulanan PO"
            documentType="Laporan Bulanan PO"
            documentNo={`PO_${monthlyReport.year}_${String(monthlyReport.month).padStart(2, '0')}`}
            orientation="landscape"
          >
            {(printMode) => (
              <PoMonthlyReportPrintTemplate report={monthlyReport} printMode={printMode} />
            )}
          </DocumentPreviewModal>
        </>
      )}
    </div>
  );
}
