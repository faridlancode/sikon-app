import React from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  Scale,
  TrendingUp,
  HelpCircle,
  Coins,
  ShieldCheck,
} from 'lucide-react';
import Card from '../../ui/card';
import { formatIDR } from '../../../utils/formatCurrency';
import type { EquityChangesReport, EquityChangesRow } from '../../../types';

interface EquityChangesViewProps {
  report: EquityChangesReport;
}

export default function EquityChangesView({ report }: EquityChangesViewProps) {
  const { meta, rows, totals } = report;

  function renderAmount(val: number | null | undefined) {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }
    const isNeg = val < 0;
    return (
      <span
        className={`font-mono tabular-nums ${
          isNeg ? 'text-destructive font-semibold' : 'text-foreground'
        }`}
      >
        {isNeg ? `(${formatIDR(Math.abs(val))})` : formatIDR(val)}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Lencana Rekonsiliasi & Status Singkat */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border border-border text-xs">
        <div className="flex items-center gap-2">
          {meta.reconciled ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Cocok dengan Neraca
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
              <AlertOctagon className="h-3.5 w-3.5" />
              Tidak Cocok dengan Neraca (Selisih: {formatIDR(totals.difference)})
            </span>
          )}
          <span className="text-muted-foreground">
            Total Ekuitas Akhir ({formatIDR(totals.closing_equity)}) sama persis dengan Total Ekuitas pada Laporan Neraca per {meta.to}.
          </span>
        </div>
        <div className="font-mono text-muted-foreground text-[11px]">
          Periode: {meta.from} s/d {meta.to}
        </div>
      </div>

      {/* 2. Kartu Ringkasan Perjalanan Ekuitas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border border-border">
          <span className="text-xs font-semibold text-muted-foreground">
            Ekuitas Awal Periode
          </span>
          <p className="mt-2 text-xl font-bold font-mono">
            {renderAmount(totals.opening_equity)}
          </p>
          <span className="text-[11px] text-muted-foreground mt-1 block">
            Modal bersih pada awal periode
          </span>
        </Card>

        <Card className="p-4 border border-border">
          <span className="text-xs font-semibold text-muted-foreground">
            Laba Bersih Berjalan
          </span>
          <p className="mt-2 text-xl font-bold font-mono">
            {renderAmount(rows.find((r) => r.key === 'net_profit')?.amount ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground mt-1 block">
            Hasil usaha dari Laporan Laba Rugi
          </span>
        </Card>

        <Card className="p-4 border border-border bg-primary/5 border-primary/20">
          <span className="text-xs font-bold text-primary">
            Ekuitas Akhir Periode
          </span>
          <p className="mt-2 text-xl font-bold font-mono text-primary">
            {renderAmount(totals.closing_equity)}
          </p>
          <span className="text-[11px] text-muted-foreground mt-1 block">
            Kekayaan bersih pemilik saat ini
          </span>
        </Card>
      </div>

      {/* 3. Tabel Laporan Perubahan Ekuitas */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="bg-muted/60 px-4 py-3 border-b border-border flex items-center justify-between">
          <h4 className="font-bold text-xs uppercase tracking-wider text-primary">
            Rincian Perubahan Ekuitas Pemilik
          </h4>
          <span className="text-xs text-muted-foreground font-mono">
            {meta.from} s/d {meta.to}
          </span>
        </div>

        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
              <th className="p-3 pl-4">Komponen Ekuitas</th>
              <th className="p-3 pr-4 text-right">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const isClosing = row.key === 'closing_equity';
              const isOpening = row.key === 'opening_equity';
              return (
                <tr
                  key={row.key}
                  className={`hover:bg-muted/20 ${
                    isClosing
                      ? 'bg-primary/5 font-bold border-t-2 border-primary/20'
                      : isOpening
                      ? 'bg-muted/20 font-semibold'
                      : ''
                  }`}
                >
                  <td className={`p-3 pl-4 ${isClosing ? 'text-primary text-sm' : 'text-foreground'}`}>
                    {row.label}
                  </td>
                  <td className={`p-3 pr-4 text-right font-mono ${isClosing ? 'text-primary font-bold text-sm' : ''}`}>
                    {renderAmount(row.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. Rekonsiliasi & Uji Silang Neraca */}
      <Card className="p-4 border border-border bg-muted/20 text-xs space-y-3">
        <div className="flex items-center justify-between font-semibold">
          <span className="flex items-center gap-2 text-foreground">
            <Scale className="h-4 w-4 text-primary" />
            Uji Silang Keseimbangan (Cross-Check) dengan Neraca
          </span>
          <span className="font-mono text-muted-foreground">
            Status: {meta.reconciled ? 'Terekonsiliasi Sempurna' : 'Perlu Diperiksa'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-3">
          <div>
            <span className="text-muted-foreground block text-[11px]">Ekuitas Akhir Laporan ini:</span>
            <span className="font-mono font-bold">{formatIDR(totals.closing_equity)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Total Ekuitas di Neraca:</span>
            <span className="font-mono font-bold">{formatIDR(totals.balance_sheet_equity)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Selisih Rekonsiliasi:</span>
            <span className={`font-mono font-bold ${totals.difference !== 0 ? 'text-destructive' : 'text-success'}`}>
              {formatIDR(totals.difference)}
            </span>
          </div>
        </div>
      </Card>

      {/* 5. Kotak Edukasi: Apa artinya? */}
      <Card className="p-5 border border-border bg-muted/30 text-xs space-y-2.5">
        <div className="flex items-center gap-2 font-bold text-foreground text-sm">
          <HelpCircle className="h-4 w-4 text-primary" />
          Apa yang Ditunjukkan Laporan Ini?
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Laporan Perubahan Ekuitas menghubungkan <strong>Laba Rugi</strong> dengan <strong>Neraca</strong>. Laporan ini merangkum seluruh faktor yang menambah atau mengurangi kekayaan bersih pemilik bisnis konveksi selama periode berjalan:
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
          <li>
            <strong>Laba Bersih:</strong> Keuntungan operasional usaha yang meningkatkan hak pemilik atas aset perusahaan.
          </li>
          <li>
            <strong>Setoran Modal:</strong> Uang pribadi yang disuntikkan pemilik ke rekening bisnis sebagai penambahan modal usaha.
          </li>
          <li>
            <strong>Prive:</strong> Pengambilan uang dari rekening kas/bank bisnis untuk keperluan pribadi pemilik, yang langsung mengurangi modal.
          </li>
          <li>
            <strong>Koreksi Laba Ditahan:</strong> Penyesuaian ekuitas dari periode sebelumnya atau penyeimbang saldo awal aset lama.
          </li>
        </ul>
      </Card>
    </div>
  );
}
