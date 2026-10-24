import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Printer,
  FileDown,
  ShoppingBag,
  Layers,
  DollarSign,
  TrendingUp,
  CreditCard,
  User,
  Package,
  CalendarRange,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { usePoReports } from '../../../hooks/usePoReports';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID, todayISO } from '../../../utils/dateHelpers';
import { formatPoDateRange } from '../poHelpers';
import DocumentPreviewModal from '../../documents/DocumentPreviewModal';
import PoDailyReportPrintTemplate from './PoDailyReportPrintTemplate';
import SalesCategoryMatrixTable from './SalesCategoryMatrixTable';
import PastUnpaidPosSection from './PastUnpaidPosSection';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { downloadPoDailyReportPdf } from '../../../lib/pdf/poDailyReportPdf';

export default function PoDailyReportTab() {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { dailyReport, loadingDaily, reportError, fetchDailyReport } = usePoReports();
  const { profile } = useCompanySettings();

  async function handleDownloadPdf() {
    if (!dailyReport) return;
    try {
      setDownloadingPdf(true);
      await downloadPoDailyReportPdf(dailyReport, profile);
    } catch (err) {
      console.error('Gagal mengunduh PDF laporan harian:', err);
    } finally {
      setDownloadingPdf(false);
    }
  }

  useEffect(() => {
    fetchDailyReport(selectedDate);
  }, [selectedDate, fetchDailyReport]);

  const handleQuickDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const posList = dailyReport?.pos || [];

  return (
    <div className="space-y-6">
      {/* Filter Tanggal & Tombol Cetak */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Pilih Tanggal:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleQuickDate(0)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedDate === todayISO()
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => handleQuickDate(1)}
              className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              Kemarin
            </button>
          </div>
        </div>

        <button
          onClick={() => setIsPrintModalOpen(true)}
          disabled={!dailyReport || loadingDaily}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Pratinjau Cetak</span>
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={!dailyReport || loadingDaily || downloadingPdf}
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
      {loadingDaily && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-xs font-medium">Memuat data laporan harian...</span>
        </div>
      )}

      {/* Report Content */}
      {!loadingDaily && dailyReport && (
        <>
          {/* PO Context Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">
                    {posList.length > 0
                      ? posList.map((p) => p.name).join(', ')
                      : dailyReport.po?.code || 'Laporan Harian Order'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {posList.length > 0
                    ? `Mencakup ${posList.length} Batch PO pada tanggal transaksi ini.`
                    : 'Aktivitas transaksi harian seluruh pesanan.'}
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground sm:text-right">
              Laporan untuk tanggal: <span className="font-semibold text-foreground">{formatDateID(dailyReport.date)}</span>
            </div>
          </div>

          {/* 4 Summary Cards (Hari Ini) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Order & Pcs */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Pesanan Hari Ini</span>
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                  <ShoppingBag className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-foreground font-mono">
                  {dailyReport.summary.order_count} <span className="text-xs font-normal text-muted-foreground">order</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  Total: {dailyReport.summary.total_pcs} pcs
                </div>
              </div>
            </div>

            {/* Card 2: Nilai Pesanan */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Nilai Pesanan Hari Ini</span>
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-foreground font-mono">
                  {formatIDR(dailyReport.summary.total_price)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Booking hari ini (bruto)
                </div>
              </div>
            </div>

            {/* Card 3: Total Ongkir */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Ongkos Kirim Hari Ini</span>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-foreground font-mono">
                  {formatIDR(dailyReport.summary.total_ongkir)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Total ongkir order hari ini
                </div>
              </div>
            </div>

            {/* Card 4: Pembayaran Masuk */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Kas Masuk Hari Ini</span>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatIDR(dailyReport.summary.payment_received)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  DP / pelunasan yang diterima
                </div>
              </div>
            </div>
          </div>

          {/* Kotak Kumulatif per PO dari array pos (REVISI 1 §5.1) */}
          {posList.length > 0 && (
            <div className="space-y-4">
              {posList.map((po) => {
                const hasQuota = po.quota_qty != null && po.quota_qty > 0;
                const pct = po.quota_used_pct ?? 0;
                return (
                  <div key={po.batch_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3 border-b border-border pb-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Kumulatif {po.name} ({po.code}) s.d. {formatDateID(dailyReport.date)}
                        </h3>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Periode: {formatPoDateRange(po.start_date, po.end_date)} &bull; Hari ini: <strong>{po.today_orders} order ({po.today_pcs} pcs)</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
                        <span className="text-base font-bold text-foreground font-mono">
                          {po.cum_orders}{' '}
                          <span className="text-xs font-normal text-muted-foreground">order</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Total Pcs:</span>
                        <span className="text-base font-bold text-foreground font-mono">
                          {po.cum_pcs}{' '}
                          <span className="text-xs font-normal text-muted-foreground">pcs</span>
                        </span>
                        {hasQuota && (
                          <span className={`block text-[10px] font-medium ${pct >= 100 ? 'text-destructive font-bold' : pct >= 90 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                            Kuota: {po.quota_qty} pcs ({pct}%)
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Nilai Booking PO:</span>
                        <span className="text-base font-bold text-foreground font-mono">
                          {formatIDR(po.cum_price)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Total Kas Masuk PO:</span>
                        <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatIDR(po.cum_paid)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rincian Pesanan per Sales & Kategori (Matrix Cross-tab) */}
          <SalesCategoryMatrixTable
            matrix={dailyReport.sales_category_matrix}
            title="Rincian Pesanan per Sales & Kategori (Hari Ini)"
            subtitle={`Aktivitas ${formatDateID(dailyReport.date)}`}
            isPrint={false}
            showRevenue={true}
          />

          {/* Sisa Pelunasan PO Terdahulu yang Belum Lunas */}
          <PastUnpaidPosSection unpaidPos={dailyReport.past_unpaid_pos} isPrint={false} />

          {/* Orders Table */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Daftar Pesanan Hari Ini
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Semua pesanan yang tercatat pada tanggal {formatDateID(dailyReport.date)}
                </p>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                Total: {dailyReport.orders.length} pesanan
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium">No. Order</th>
                    <th className="py-2.5 px-3 text-left font-medium">Batch PO</th>
                    <th className="py-2.5 px-3 text-left font-medium">Pelanggan</th>
                    <th className="py-2.5 px-3 text-left font-medium">Sales</th>
                    <th className="py-2.5 px-3 text-right font-medium">Qty (pcs)</th>
                    <th className="py-2.5 px-3 text-right font-medium">Total Harga</th>
                    <th className="py-2.5 px-3 text-right font-medium">Ongkir</th>
                    <th className="py-2.5 px-3 text-center font-medium">Status Bayar</th>
                    <th className="py-2.5 px-3 text-center font-medium">Produksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {dailyReport.orders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted-foreground">
                        Tidak ada pesanan yang tercatat pada tanggal ini.
                      </td>
                    </tr>
                  ) : (
                    dailyReport.orders.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">{o.order_id}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {o.po_name || '-'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-foreground block">{o.customer_name}</span>
                          {o.customer_phone && (
                            <span className="text-[10px] text-muted-foreground block">{o.customer_phone}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{o.sales_name || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-foreground">{o.total_pcs}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                          {formatIDR(o.total_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                          {formatIDR(o.ongkir)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                              o.payment_status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : o.payment_status === 'partial'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                            }`}
                          >
                            {o.payment_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[11px] text-muted-foreground capitalize">
                            {o.production_status || 'Menunggu'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Preview & Cetak PDF */}
          {dailyReport && (
            <DocumentPreviewModal
              isOpen={isPrintModalOpen}
              onClose={() => setIsPrintModalOpen(false)}
              title="Pratinjau Laporan Harian PO"
              documentType="Laporan Harian PO"
              documentNo={`LAP_HARIAN_${dailyReport.date}`}
              orientation="landscape"
            >
              {(printMode) => (
                <PoDailyReportPrintTemplate report={dailyReport} printMode={printMode} />
              )}
            </DocumentPreviewModal>
          )}
        </>
      )}
    </div>
  );
}
