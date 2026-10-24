import React from 'react';
import { Building2, Scissors, Layers, CheckCircle2 } from 'lucide-react';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import { formatDateID } from '../../../utils/dateHelpers';
import type { PoCloseReport, PrintSignatureMode } from '../../../types';

interface PoProductionProgressPrintTemplateProps {
  report: PoCloseReport;
  printMode?: PrintSignatureMode;
}

export default function PoProductionProgressPrintTemplate({
  report,
}: PoProductionProgressPrintTemplateProps) {
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

  const orders = snapshot.production_progress_orders || [];
  const totalPcs = snapshot.summary.total_pcs;
  const cutPcs = live?.production?.cutting_completed_pcs ?? 0;
  const cutPct = live?.production?.cutting_pct ?? 0;
  const sewPcs = live?.production?.sewing_completed_pcs ?? 0;
  const sewPct = live?.production?.sewing_pct ?? 0;
  const qcPcs = live?.production?.qc_passed_pcs ?? 0;
  const qcPct = live?.production?.qc_pct ?? 0;

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
          <h2 className="text-base font-black tracking-wider uppercase text-indigo-700 dark:text-indigo-400">
            LAPORAN PROGRES PRODUKSI
          </h2>
          <p className="text-xs font-semibold text-foreground mt-0.5">
            {snapshot.batch?.name || report.batch.name || report.batch.code} ({report.batch.code})
          </p>
          <p className="text-[11px] text-muted-foreground">
            Periode: {formatDateID(report.batch.start_date)} – {formatDateID(report.batch.end_date)} &bull; Status: Closed
          </p>
        </div>
      </div>

      {/* Ringkasan Progres Fisik Keseluruhan */}
      <div className="grid grid-cols-4 gap-3 text-xs break-inside-avoid">
        <div className="rounded border border-border p-2.5 bg-muted/20">
          <span className="text-muted-foreground block text-[11px]">Total Pesanan:</span>
          <span className="font-bold text-foreground font-mono text-sm">
            {snapshot.summary.total_orders} order
          </span>
          <span className="text-[10px] text-muted-foreground block font-mono">
            {totalPcs} pcs total produksi
          </span>
        </div>

        <div className="rounded border border-border p-2.5 bg-blue-50/50 dark:bg-blue-950/20">
          <span className="text-blue-800 dark:text-blue-300 block text-[11px] font-medium">
            Progres Potong:
          </span>
          <span className="font-bold text-blue-700 dark:text-blue-400 font-mono text-sm">
            {cutPcs} / {totalPcs} pcs
          </span>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 block font-semibold">
            {cutPct}% selesai
          </span>
        </div>

        <div className="rounded border border-border p-2.5 bg-indigo-50/50 dark:bg-indigo-950/20">
          <span className="text-indigo-800 dark:text-indigo-300 block text-[11px] font-medium">
            Progres Jahit:
          </span>
          <span className="font-bold text-indigo-700 dark:text-indigo-400 font-mono text-sm">
            {sewPcs} / {totalPcs} pcs
          </span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-semibold">
            {sewPct}% selesai
          </span>
        </div>

        <div className="rounded border border-border p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20">
          <span className="text-emerald-800 dark:text-emerald-300 block text-[11px] font-medium">
            QC / Lolos Siap Kirim:
          </span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-sm">
            {qcPcs} / {totalPcs} pcs
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
            {qcPct}% lolos QC
          </span>
        </div>
      </div>

      {/* Tabel Rincian Progres Produksi per Order (Urut dari Order Terbanyak) */}
      <div className="border border-border rounded-lg overflow-hidden break-inside-avoid">
        <div className="bg-muted px-3 py-1.5 font-bold text-xs uppercase border-b border-border flex justify-between items-center">
          <span>Rincian Order Produksi (Urut Volume Terbanyak)</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            Diurutkan berdasarkan kuantitas pcs terbesar
          </span>
        </div>
        <table className="w-full text-xs">
          <thead className="border-b border-border text-muted-foreground bg-muted/10">
            <tr>
              <th className="py-1 px-2 text-center font-medium w-8">No</th>
              <th className="py-1 px-2.5 text-left font-medium">No. Order / Pelanggan</th>
              <th className="py-1 px-2 text-left font-medium">Item & Kategori</th>
              <th className="py-1 px-2 text-left font-medium">Sales</th>
              <th className="py-1 px-2 text-right font-bold text-foreground">Total Pcs</th>
              <th className="py-1 px-2 text-center font-medium">Potong</th>
              <th className="py-1 px-2 text-center font-medium">Jahit</th>
              <th className="py-1 px-2 text-center font-medium">QC Lolos</th>
              <th className="py-1 px-2.5 text-center font-medium">Status Produksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-4 text-center text-muted-foreground">
                  Tidak ada data pesanan pada Batch PO ini.
                </td>
              </tr>
            ) : (
              orders.map((o, idx) => (
                <tr key={o.id} className="hover:bg-muted/10">
                  <td className="py-1.5 px-2 text-center font-mono text-muted-foreground">{idx + 1}</td>
                  <td className="py-1.5 px-2.5">
                    <span className="font-mono font-bold text-foreground block">{o.order_id}</span>
                    <span className="text-muted-foreground block text-[11px]">{o.customer_name}</span>
                  </td>
                  <td className="py-1.5 px-2 max-w-[160px] truncate" title={o.items_summary}>
                    <span className="text-foreground text-[11px] block">{o.items_summary || '-'}</span>
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground text-[11px]">{o.sales_name || '-'}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-bold text-foreground text-sm">
                    {o.total_pcs}
                  </td>
                  <td className="py-1.5 px-2 text-center font-mono">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
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
                  <td className="py-1.5 px-2 text-center font-mono">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
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
                  <td className="py-1.5 px-2 text-center font-mono">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
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
                  <td className="py-1.5 px-2.5 text-center">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-foreground">
                      {o.production_status || 'Pending'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {orders.length > 0 && (
            <tfoot className="border-t-2 border-border bg-muted/20 font-bold">
              <tr>
                <td colSpan={4} className="py-1.5 px-2.5 text-left uppercase text-[11px] font-black">
                  Total Fisik Produksi
                </td>
                <td className="py-1.5 px-2 text-right font-mono font-black text-foreground text-sm">
                  {totalPcs}
                </td>
                <td className="py-1.5 px-2 text-center font-mono font-bold text-foreground">
                  {cutPcs} pcs
                </td>
                <td className="py-1.5 px-2 text-center font-mono font-bold text-foreground">
                  {sewPcs} pcs
                </td>
                <td className="py-1.5 px-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {qcPcs} pcs
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
        <div>
          Laporan Monitoring Progres Produksi &bull; Diunduh dari SIKon Konveksi
        </div>
        <div>
          Waktu Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}
