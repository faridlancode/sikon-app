import React from 'react';
import { Building2 } from 'lucide-react';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { formatIDR } from '../../../utils/formatCurrency';
import { formatDateID } from '../../../utils/dateHelpers';
import type { PoDailyReport, PrintSignatureMode } from '../../../types';
import SalesCategoryMatrixTable from './SalesCategoryMatrixTable';
import PastUnpaidPosSection from './PastUnpaidPosSection';

interface PoDailyReportPrintTemplateProps {
  report: PoDailyReport;
  printMode?: PrintSignatureMode;
}

export default function PoDailyReportPrintTemplate({
  report,
}: PoDailyReportPrintTemplateProps) {
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
            LAPORAN HARIAN BATCH PO
          </h2>
          <p className="text-xs font-semibold text-primary mt-0.5">
            {report.pos && report.pos.length > 0
              ? report.pos.map((p) => p.name).join(', ')
              : report.po?.code || 'Aktivitas Harian Order'}
          </p>
          <p className="text-xs text-muted-foreground">
            Tanggal: {formatDateID(report.date)}
          </p>
        </div>
      </div>

      {/* Ringkasan Hari Ini */}
      <div className="break-inside-avoid">
        <div className="rounded-lg border border-border p-3 bg-muted/20">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Aktivitas Hari Ini ({formatDateID(report.date)})
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
              <span className="font-bold text-foreground font-mono text-sm">
                {report.summary.order_count} order ({report.summary.total_pcs} pcs)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Nilai Pesanan:</span>
              <span className="font-bold text-foreground font-mono text-sm">
                {formatIDR(report.summary.total_price)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Total Ongkir:</span>
              <span className="font-medium text-foreground font-mono">
                {formatIDR(report.summary.total_ongkir)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Pembayaran Masuk:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                {formatIDR(report.summary.payment_received)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Kotak Kumulatif per PO (REVISI 1 §5.1) */}
      {report.pos && report.pos.length > 0 ? (
        <div className="space-y-3 break-inside-avoid">
          {report.pos.map((p) => (
            <div key={p.batch_id} className="rounded-lg border border-border p-3 bg-muted/10">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-foreground mb-2 pb-1 border-b border-border/50">
                <span>Kumulatif {p.name} ({p.code}) s.d. {formatDateID(report.date)}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Hari ini: {p.today_orders} order ({p.today_pcs} pcs)
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
                  <span className="font-bold text-foreground font-mono text-sm">
                    {p.cum_orders} order
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Total Pcs:</span>
                  <span className="font-bold text-foreground font-mono text-sm">
                    {p.cum_pcs} pcs
                  </span>
                  {p.quota_qty != null && p.quota_qty > 0 && (
                    <span className="block text-[10px] text-muted-foreground">
                      Kuota: {p.quota_qty} pcs ({p.quota_used_pct ?? 0}%)
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Nilai Booking PO:</span>
                  <span className="font-bold text-foreground font-mono text-sm">
                    {formatIDR(p.cum_price)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Pembayaran Masuk:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                    {formatIDR(p.cum_paid)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : report.cumulative_since_monday ? (
        <div className="rounded-lg border border-border p-3 bg-muted/20 break-inside-avoid">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Kumulatif ({formatDateID(report.cumulative_since_monday.from_date)} s/d {formatDateID(report.cumulative_since_monday.to_date)})
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
              <span className="font-bold text-foreground font-mono text-sm">
                {report.cumulative_since_monday.order_count} order ({report.cumulative_since_monday.total_pcs} pcs)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Nilai Booking:</span>
              <span className="font-bold text-foreground font-mono text-sm">
                {formatIDR(report.cumulative_since_monday.total_price)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Pembayaran Masuk:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                {formatIDR(report.cumulative_since_monday.payment_received)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Rincian Pesanan per Sales & Kategori (Matrix Cross-tab) */}
      <SalesCategoryMatrixTable
        matrix={report.sales_category_matrix}
        title="Rincian Pesanan per Sales & Kategori (Hari Ini)"
        subtitle={`Aktivitas ${formatDateID(report.date)}`}
        isPrint={true}
        showRevenue={true}
      />

      {/* Sisa Pelunasan PO Terdahulu yang Belum Lunas */}
      <PastUnpaidPosSection unpaidPos={report.past_unpaid_pos} isPrint={true} />

      {/* Daftar Order Hari Ini */}
      <div className="border border-border rounded-lg overflow-hidden break-inside-avoid">
        <div className="bg-muted px-3 py-1.5 font-bold text-xs uppercase border-b border-border flex justify-between items-center">
          <span>Daftar Pesanan Hari Ini</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            Total {report.orders.length} pesanan
          </span>
        </div>
        <table className="w-full text-xs">
          <thead className="border-b border-border text-muted-foreground bg-muted/10">
            <tr>
              <th className="py-1.5 px-2.5 text-left font-medium">No. Order</th>
              <th className="py-1.5 px-2 text-left font-medium">PO</th>
              <th className="py-1.5 px-2 text-left font-medium">Pelanggan</th>
              <th className="py-1.5 px-2 text-left font-medium">Sales</th>
              <th className="py-1.5 px-2 text-right font-medium">Pcs</th>
              <th className="py-1.5 px-2 text-right font-medium">Total Harga</th>
              <th className="py-1.5 px-2 text-center font-medium">Status Bayar</th>
              <th className="py-1.5 px-2.5 text-center font-medium">Produksi</th>
            </tr>
          </thead>
          <tbody>
            {report.orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-muted-foreground">
                  Tidak ada pesanan yang dibuat pada tanggal ini
                </td>
              </tr>
            ) : (
              report.orders.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="py-1.5 px-2.5 font-mono font-medium">{o.order_id}</td>
                  <td className="py-1.5 px-2 font-medium text-primary">{o.po_name || '-'}</td>
                  <td className="py-1.5 px-2">{o.customer_name}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{o.sales_name || '-'}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{o.total_pcs}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-medium">{formatIDR(o.total_price)}</td>
                  <td className="py-1.5 px-2 text-center capitalize">{o.payment_status}</td>
                  <td className="py-1.5 px-2.5 text-center capitalize">{o.production_status || 'Menunggu'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
        <div>
          Laporan Operasional Pre-Order &bull; Diunduh dari SIKon Konveksi
        </div>
        <div>
          Waktu Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}
