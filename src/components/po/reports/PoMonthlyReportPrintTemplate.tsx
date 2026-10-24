import React from 'react';
import { Building2 } from 'lucide-react';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID } from '../../../utils/dateHelpers';
import type { PoMonthlyReport, PrintSignatureMode } from '../../../types';
import SalesCategoryMatrixTable from './SalesCategoryMatrixTable';

interface PoMonthlyReportPrintTemplateProps {
  report: PoMonthlyReport;
  printMode?: PrintSignatureMode;
}

export default function PoMonthlyReportPrintTemplate({
  report,
}: PoMonthlyReportPrintTemplateProps) {
  const { profile } = useCompanySettings();

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
            LAPORAN BULANAN BATCH PO
          </h2>
          <p className="text-xs font-semibold text-primary mt-0.5">
            Periode: {report.month_name} {report.year}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Total {report.totals.po_count} Batch PO Terdaftar
          </p>
        </div>
      </div>

      {/* Ringkasan Bulanan */}
      <div className="grid grid-cols-4 gap-3 text-xs break-inside-avoid">
        <div className="rounded border border-border p-2.5 bg-muted/20">
          <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
          <span className="font-bold text-foreground font-mono text-sm">
            {report.totals.order_count} order
          </span>
          <span className="text-[10px] text-muted-foreground block font-mono">
            {report.totals.total_pcs} pcs dipesan
          </span>
          {report.totals.total_quota_qty != null && report.totals.total_quota_qty > 0 && (
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              Kuota: {report.totals.total_quota_qty} pcs ({report.totals.quota_used_pct ?? 0}%)
            </span>
          )}
        </div>

        <div className="rounded border border-border p-2.5 bg-muted/20">
          <span className="text-muted-foreground block text-[11px]">Nilai Booking PO:</span>
          <span className="font-bold text-foreground font-mono text-sm">
            {formatIDR(report.totals.booking_value)}
          </span>
          <span className="text-[10px] text-muted-foreground block font-mono">
            Terbayar: {formatIDR(report.totals.paid_amount)}
          </span>
        </div>

        <div className="rounded border border-border p-2.5 bg-muted/20">
          <span className="text-muted-foreground block text-[11px]">Margin Kotor (Estimasi):</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">
            {formatIDR(report.totals.estimated_margin)}
          </span>
          <span className="text-[10px] text-muted-foreground block font-mono">
            HPP Est: {formatIDR(report.totals.hpp_total_estimate)}
          </span>
        </div>

        <div className="rounded border border-border p-2.5 bg-muted/20">
          <span className="text-muted-foreground block text-[11px]">Biaya Operasional Langsung:</span>
          <span className="font-medium text-foreground block text-[11px] font-mono">
            Borongan: {formatIDR(report.totals.actual_piecework_wage)}
          </span>
          <span className="font-medium text-foreground block text-[11px] font-mono">
            Bahan: {formatIDR(report.totals.material_purchases)}
          </span>
        </div>
      </div>

      {/* Rincian Pesanan per Sales & Kategori (Matrix Cross-tab Bulanan) */}
      <SalesCategoryMatrixTable
        matrix={report.sales_category_matrix}
        title={`Rincian Pesanan per Sales & Kategori (${report.month_name} ${report.year})`}
        subtitle="Agregasi seluruh batch PO pada bulan laporan"
        isPrint={true}
        showRevenue={true}
      />

      {/* Tabel Kinerja per Batch PO (Desain Rapi & Terbaca - Landscape 10 Kolom) */}
      <div className="border border-border rounded-lg overflow-hidden break-inside-avoid">
        <div className="bg-muted px-3 py-1.5 font-bold text-xs uppercase border-b border-border flex justify-between">
          <span>Kinerja Finansial & Operasional per Batch PO</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            Periode: {report.month_name} {report.year}
          </span>
        </div>
        <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {/* Batch PO & Periode – lebar cukup untuk nama + kode + rentang tanggal */}
            <col style={{ width: '26%' }} />
            {/* Status */}
            <col style={{ width: '6%' }} />
            {/* Kuota */}
            <col style={{ width: '8%' }} />
            {/* Order / Pcs */}
            <col style={{ width: '8%' }} />
            {/* Nilai Booking */}
            <col style={{ width: '12%' }} />
            {/* Terbayar */}
            <col style={{ width: '10%' }} />
            {/* Sisa Piutang */}
            <col style={{ width: '10%' }} />
            {/* Est. Margin */}
            <col style={{ width: '10%' }} />
            {/* Borongan */}
            <col style={{ width: '5%' }} />
            {/* Bahan Baku */}
            <col style={{ width: '5%' }} />
          </colgroup>
          <thead className="border-b border-border text-muted-foreground bg-muted/20">
            <tr>
              <th className="py-1.5 px-2.5 text-left font-medium">Batch PO &amp; Periode</th>
              <th className="py-1.5 px-2 text-center font-medium">Status</th>
              <th className="py-1.5 px-2 text-right font-medium">Kuota</th>
              <th className="py-1.5 px-2 text-right font-medium">Order / Pcs</th>
              <th className="py-1.5 px-2 text-right font-medium">Nilai Booking</th>
              <th className="py-1.5 px-2 text-right font-medium">Terbayar</th>
              <th className="py-1.5 px-2 text-right font-medium text-rose-700 dark:text-rose-400">Sisa Piutang</th>
              <th className="py-1.5 px-2 text-right font-medium text-indigo-700 dark:text-indigo-400">Est. Margin</th>
              <th className="py-1.5 px-2 text-right font-medium">Borongan</th>
              <th className="py-1.5 px-2.5 text-right font-medium">Bahan Baku</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {report.po_batches.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-4 text-center text-muted-foreground">
                  Tidak ada batch PO pada bulan ini
                </td>
              </tr>
            ) : (
              report.po_batches.map((po) => (
                <tr key={po.batch_id} className="hover:bg-muted/10">
                  {/* Kolom 1: nama PO — 2 baris, tidak perlu wrap panjang */}
                  <td className="py-2 px-2.5" style={{ wordBreak: 'break-word' }}>
                    <span className="font-semibold text-foreground block leading-tight">
                      {po.name || po.code}
                    </span>
                    <span
                      className="font-mono text-muted-foreground block leading-tight"
                      style={{ fontSize: '9px', whiteSpace: 'normal' }}
                    >
                      {po.code} &bull; {formatDateID(po.start_date)} – {formatDateID(po.end_date)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center align-middle">
                    <span
                      className="inline-block rounded bg-muted px-1 py-0.5 font-bold uppercase text-foreground"
                      style={{ fontSize: '9px' }}
                    >
                      {po.status}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {po.quota_qty != null && po.quota_qty > 0 ? (
                      <>
                        <span className="font-medium text-foreground block">{po.quota_qty} pcs</span>
                        <span className="block text-muted-foreground" style={{ fontSize: '9px' }}>({po.quota_used_pct ?? 0}%)</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground" style={{ fontSize: '9px' }}>-</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    <span className="font-medium text-foreground block">{po.order_count} order</span>
                    <span className="text-muted-foreground block" style={{ fontSize: '9px' }}>{po.total_pcs} pcs</span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-medium text-foreground">
                    {formatIDR(po.booking_value)}
                    {po.total_ongkir > 0 && (
                      <span className="block text-muted-foreground" style={{ fontSize: '9px' }}>
                        +{formatIDR(po.total_ongkir)} ongkir
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    {formatIDR(po.paid_amount)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50/20">
                    {formatIDR(po.receivable_amount)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {formatIDR(po.estimated_margin)}
                    <span className="block text-muted-foreground font-normal" style={{ fontSize: '9px' }}>
                      HPP: {formatIDR(po.hpp_total_estimate)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                    {formatIDR(po.actual_piecework_wage)}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">
                    {formatIDR(po.material_purchases)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t-2 border-border font-bold bg-muted/30">
            <tr>
              <td className="py-2 px-2.5 font-bold uppercase" style={{ fontSize: '10px' }} colSpan={2}>
                Total Akumulasi Bulan Ini:
              </td>
              <td className="py-2 px-2 text-right font-mono" style={{ fontSize: '10px' }}>
                {report.totals.total_quota_qty != null && report.totals.total_quota_qty > 0 ? (
                  <>
                    {report.totals.total_quota_qty} pcs
                    <span className="block text-muted-foreground" style={{ fontSize: '9px' }}>({report.totals.quota_used_pct ?? 0}%)</span>
                  </>
                ) : (
                  '-'
                )}
              </td>
              <td className="py-2 px-2 text-right font-mono font-bold">
                {report.totals.order_count} order
                <span className="block text-muted-foreground font-mono" style={{ fontSize: '9px' }}>
                  {report.totals.total_pcs} pcs
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono font-black text-foreground">
                {formatIDR(report.totals.booking_value)}
              </td>
              <td className="py-2 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatIDR(report.totals.paid_amount)}
              </td>
              <td className="py-2 px-2 text-right font-mono font-bold text-rose-700 dark:text-rose-400 bg-rose-50/30">
                {formatIDR(
                  report.po_batches.reduce(
                    (acc, curr) => acc + (Number(curr.receivable_amount) || 0),
                    0
                  )
                )}
              </td>
              <td className="py-2 px-2 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                {formatIDR(report.totals.estimated_margin)}
              </td>
              <td className="py-2 px-2 text-right font-mono font-bold text-foreground">
                {formatIDR(report.totals.actual_piecework_wage)}
              </td>
              <td className="py-2 px-2.5 text-right font-mono font-bold text-foreground">
                {formatIDR(report.totals.material_purchases)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Upah Borongan & Pembelian Bahan Tidak Terkait PO */}
      {(report.unlinked_piecework_wage > 0 || Number(report.unlinked_material_purchases || 0) > 0) && (
        <div className="space-y-1.5 break-inside-avoid">
          {report.unlinked_piecework_wage > 0 && (
            <div className="rounded border border-border p-2.5 text-xs text-muted-foreground">
              <strong>Upah Borongan (Tidak Terkait PO):</strong> Terdapat upah borongan sebesar{' '}
              <span className="font-mono font-bold text-foreground">
                {formatIDR(report.unlinked_piecework_wage)}
              </span>{' '}
              yang dikerjakan tanpa nomor order (tidak terkait PO tertentu).
            </div>
          )}

          {Number(report.unlinked_material_purchases || 0) > 0 && (
            <div className="rounded border border-border p-2.5 text-xs text-muted-foreground">
              <strong>Pembelian Bahan Baku (Tidak Terkait PO):</strong> Terdapat belanja bahan sebesar{' '}
              <span className="font-mono font-bold text-foreground">
                {formatIDR(Number(report.unlinked_material_purchases))}
              </span>{' '}
              dari nota umum yang tidak terhubung ke Batch PO mana pun.
            </div>
          )}
        </div>
      )}

      {/* Blok Rekonsiliasi Jurnal Akuntansi */}
      <div className="rounded-lg border border-border p-3.5 bg-muted/20 text-xs break-inside-avoid space-y-2">
        <div className="font-bold uppercase tracking-wider text-foreground border-b border-border pb-1.5 flex justify-between">
          <span>Rekonsiliasi Pengakuan Pendapatan Jurnal (Bulan Kalender)</span>
          <span className="font-normal text-[10px] text-muted-foreground">
            Akun 4-1000 & 4-1100
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="text-muted-foreground block text-[11px]">Pendapatan Diakui di Jurnal:</span>
            <span className="font-mono font-bold text-foreground text-sm">
              {formatIDR(report.reconciliation.total_recognized_revenue)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Nilai Booking Batch PO:</span>
            <span className="font-mono font-bold text-foreground text-sm">
              {formatIDR(report.totals.booking_value)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Selisih Booking vs Jurnal:</span>
            <span className="font-mono font-bold text-foreground text-sm">
              {formatIDR(report.reconciliation.booking_value_difference)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          <em>{report.reconciliation.notes}</em>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
        <div>
          Laporan Analitik Pre-Order Bulanan &bull; SIKon Konveksi
        </div>
        <div>
          Waktu Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}
