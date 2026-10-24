import React from 'react';
import { Building2, AlertTriangle } from 'lucide-react';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID } from '../../../utils/dateHelpers';
import type { PoCloseReport, PrintSignatureMode } from '../../../types';
import SalesCategoryMatrixTable from './SalesCategoryMatrixTable';

interface PoCloseReportPrintTemplateProps {
  report: PoCloseReport;
  printMode?: PrintSignatureMode;
}

export default function PoCloseReportPrintTemplate({
  report,
}: PoCloseReportPrintTemplateProps) {
  const { profile } = useCompanySettings();
  const snapshot = report.close_snapshot;
  const live = report.live_status;

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        Snapshot close belum tersedia untuk Batch PO ini.
      </div>
    );
  }

  return (
    <div className="document-template space-y-6 p-2 text-foreground">
      {/* Kop Surat Perusahaan */}
      <div className="document-letterhead flex items-start justify-between border-b-2 border-border pb-4">
        <div className="flex items-center gap-4">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt="Logo"
              className="h-14 w-14 object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold tracking-normal uppercase">
              {profile.companyName || 'SIKon Konveksi'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {profile.address || 'Alamat Perusahaan'}
            </p>
            {profile.phone && (
              <p className="text-xs text-muted-foreground">Telp: {profile.phone}</p>
            )}
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-base font-black tracking-wider uppercase">
            LAPORAN CLOSE BATCH PO
          </h2>
          <p className="text-xs font-semibold text-primary mt-0.5">
            {snapshot.batch?.name || report.batch.name || report.batch.code} ({report.batch.code}) &bull; {formatDateID(report.batch.start_date)} – {formatDateID(report.batch.end_date)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Status: <span className="font-bold uppercase text-foreground">{report.batch.status}</span>
          </p>
        </div>
      </div>

      {/* Snapshot Audit Meta */}
      <div className="rounded-lg border border-border p-3 bg-muted/20 text-xs break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-muted-foreground">Waktu Penutupan (Snapshot): </span>
            <span className="font-semibold text-foreground">
              {new Date(snapshot.closed_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Ditutup oleh: </span>
            <span className="font-semibold text-foreground">{report.batch.closed_by_name || 'Admin'}</span>
          </div>
        </div>

        {snapshot.is_early && (
          <div className="mt-2 flex items-center gap-2 rounded bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Ditutup Lebih Awal:</strong> {snapshot.close_early_reason || 'Tidak ada alasan khusus'}
            </span>
          </div>
        )}

        {snapshot.close_note && (
          <div className="mt-1 text-muted-foreground">
            <strong>Catatan:</strong> {snapshot.close_note}
          </div>
        )}
      </div>

      {/* 1. Ringkasan Komersial saat Close (Snapshot) */}
      <div className="break-inside-avoid">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          1. Ringkasan Komersial Saat Tutup PO (Snapshot Dibekukan)
        </div>
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="rounded border border-border p-2.5">
            <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
            <span className="font-bold text-foreground font-mono text-sm">
              {snapshot.summary.total_orders} order
            </span>
            <span className="text-[10px] text-muted-foreground block">
              {snapshot.summary.total_pcs} pcs total
            </span>
            {snapshot.summary?.quota_qty != null && snapshot.summary.quota_qty > 0 && (
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Kuota: {snapshot.summary.quota_qty} pcs ({snapshot.summary.quota_used_pct ?? 0}%)
              </span>
            )}
          </div>
          <div className="rounded border border-border p-2.5">
            <span className="text-muted-foreground block text-[11px]">Komposisi Order:</span>
            <span className="font-medium text-foreground block">
              Satuan: {snapshot.summary.unit_orders} ({snapshot.summary.unit_pcs} pcs)
            </span>
            <span className="font-medium text-foreground block">
              Prioritas: {snapshot.summary.priority_orders} ({snapshot.summary.priority_pcs} pcs)
            </span>
          </div>
          <div className="rounded border border-border p-2.5">
            <span className="text-muted-foreground block text-[11px]">Nilai Pesanan:</span>
            <span className="font-bold text-foreground font-mono text-sm">
              {formatIDR(snapshot.summary.total_price)}
            </span>
            <span className="text-[10px] text-muted-foreground block">
              Ongkir: {formatIDR(snapshot.summary.total_ongkir)}
            </span>
          </div>
          <div className="rounded border border-border p-2.5">
            <span className="text-muted-foreground block text-[11px]">Status Bayar Saat Close:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
              {formatIDR(snapshot.summary.total_paid)}
            </span>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 block">
              Sisa: {formatIDR(snapshot.summary.total_remaining)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Rincian Pesanan per Sales & Kategori (Matrix Cross-tab) */}
      <SalesCategoryMatrixTable
        matrix={snapshot.sales_category_matrix}
        title="2. Rincian Pesanan per Sales & Kategori (Saat Close)"
        subtitle="Snapshot saat PO ditutup"
        isPrint={true}
        showRevenue={true}
      />

      {/* 3. Kondisi Terkini (Per Sekarang / Live) */}
      <div className="rounded-lg border-2 border-primary/30 p-3 bg-primary/5 break-inside-avoid">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black uppercase tracking-wider text-primary">
            3. Kondisi Terkini (Per Sekarang / Live)
          </div>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">
            Status Terupdate
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          {/* Live Bayar */}
          <div className="space-y-1">
            <span className="font-bold text-foreground block">Pelunasan Pembayaran:</span>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Terbayar Sekarang:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatIDR(live?.payment?.paid_amount ?? snapshot.summary.total_paid)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sisa Piutang:</span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                {formatIDR(live?.payment?.remaining_receivable ?? snapshot.summary.total_remaining)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Lunas:</span>
              <span className="font-mono font-medium">
                {live?.payment?.fully_paid_orders ?? 0} dari {snapshot.summary.total_orders} order
              </span>
            </div>
          </div>

          {/* Live Produksi */}
          <div className="space-y-1 border-l border-border pl-4">
            <span className="font-bold text-foreground block">Progres Produksi Fisik:</span>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Potong Selesai:</span>
              <span className="font-mono font-medium">
                {live?.production?.cutting_completed_pcs ?? 0} / {live?.production?.total_order_pcs ?? snapshot.summary.total_pcs} pcs ({live?.production?.cutting_pct ?? 0}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jahit Selesai:</span>
              <span className="font-mono font-medium">
                {live?.production?.sewing_completed_pcs ?? 0} / {live?.production?.total_order_pcs ?? snapshot.summary.total_pcs} pcs ({live?.production?.sewing_pct ?? 0}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">QC Lolos:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {live?.production?.qc_passed_pcs ?? 0} / {live?.production?.total_order_pcs ?? snapshot.summary.total_pcs} pcs ({live?.production?.qc_pct ?? 0}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
        <div>
          Laporan Rekapitulasi Penutupan Pre-Order &bull; SIKon Konveksi
        </div>
        <div>
          Waktu Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}
