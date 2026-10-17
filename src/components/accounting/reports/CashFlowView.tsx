import React from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  AlertOctagon,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Card from '../../ui/card';
import { formatIDR } from '../../../utils/formatCurrency';
import type { CashFlowReport, CashFlowSection, CashFlowRow } from '../../../types';

interface CashFlowViewProps {
  report: CashFlowReport;
}

export default function CashFlowView({ report }: CashFlowViewProps) {
  const { meta, sections, totals } = report;
  const hasCompare =
    meta.compare_from !== null &&
    meta.compare_to !== null &&
    meta.compare_from !== undefined;

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

  function renderDiffPercent(cur: number, cmp: number | null | undefined) {
    if (cmp === null || cmp === undefined || cmp === 0) {
      return <span className="text-muted-foreground font-mono">–</span>;
    }
    const diff = cur - cmp;
    const pct = ((diff / Math.abs(cmp)) * 100).toFixed(1);
    const isNeg = diff < 0;
    return (
      <span
        className={`font-mono text-[11px] tabular-nums ${
          isNeg ? 'text-destructive' : 'text-success'
        }`}
      >
        {Number(pct) > 0 ? `+${pct}%` : `${pct}%`}
      </span>
    );
  }

  const opSec = sections.find((s) => s.key === 'operating');
  const invSec = sections.find((s) => s.key === 'investing');
  const finSec = sections.find((s) => s.key === 'financing');

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
              Tidak Cocok dengan Neraca
            </span>
          )}
          <span className="text-muted-foreground">
            Kas Akhir ({formatIDR(totals.closing_cash)}) dicocokkan dengan saldo akun Kas & Bank pada Neraca per {meta.to}.
          </span>
        </div>
        <div className="font-mono text-muted-foreground text-[11px]">
          Metode Langsung
        </div>
      </div>

      {/* 2. Tiga Kartu Arus Kas Utama */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Arus Kas Operasi
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold font-mono">
            {renderAmount(totals.net_operating)}
          </p>
          {hasCompare && totals.compare_net_operating !== null && totals.compare_net_operating !== undefined && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sebelumnya: {formatIDR(totals.compare_net_operating)}</span>
              {renderDiffPercent(totals.net_operating, totals.compare_net_operating)}
            </div>
          )}
        </Card>

        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Arus Kas Investasi
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ArrowDownRight className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold font-mono">
            {renderAmount(totals.net_investing)}
          </p>
          {hasCompare && totals.compare_net_investing !== null && totals.compare_net_investing !== undefined && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sebelumnya: {formatIDR(totals.compare_net_investing)}</span>
              {renderDiffPercent(totals.net_investing, totals.compare_net_investing)}
            </div>
          )}
        </Card>

        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Arus Kas Pendanaan
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold font-mono">
            {renderAmount(totals.net_financing)}
          </p>
          {hasCompare && totals.compare_net_financing !== null && totals.compare_net_financing !== undefined && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sebelumnya: {formatIDR(totals.compare_net_financing)}</span>
              {renderDiffPercent(totals.net_financing, totals.compare_net_financing)}
            </div>
          )}
        </Card>
      </div>

      {/* 3. Tabel Rincian Arus Kas */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/60 font-semibold text-muted-foreground">
                <th className="p-3">Aktivitas Arus Kas</th>
                <th className="p-3 text-right">Jumlah (Rp)</th>
                {hasCompare && (
                  <>
                    <th className="p-3 text-right">Pembanding (Rp)</th>
                    <th className="p-3 text-right">Pertumbuhan</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Section 1: Aktivitas Operasi */}
              {opSec && (
                <>
                  <tr className="bg-muted/30 font-bold text-primary">
                    <td colSpan={hasCompare ? 4 : 2} className="px-3 py-2 uppercase tracking-wide">
                      {opSec.label}
                    </td>
                  </tr>
                  {opSec.rows.map((row) => (
                    <tr key={row.key} className="hover:bg-muted/20">
                      <td className="p-3 pl-6 text-foreground">{row.name}</td>
                      <td className="p-3 text-right">{renderAmount(row.amount)}</td>
                      {hasCompare && (
                        <>
                          <td className="p-3 text-right text-muted-foreground">
                            {renderAmount(row.compare_amount)}
                          </td>
                          <td className="p-3 text-right">
                            {renderDiffPercent(row.amount, row.compare_amount)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold border-b border-border">
                    <td className="p-3 pl-6 font-bold">Arus Kas Bersih dari Aktivitas Operasi</td>
                    <td className="p-3 text-right font-bold font-mono">
                      {renderAmount(opSec.total)}
                    </td>
                    {hasCompare && (
                      <>
                        <td className="p-3 text-right font-bold text-muted-foreground">
                          {renderAmount(opSec.compare_total)}
                        </td>
                        <td className="p-3 text-right">
                          {renderDiffPercent(opSec.total, opSec.compare_total)}
                        </td>
                      </>
                    )}
                  </tr>
                </>
              )}

              {/* Section 2: Aktivitas Investasi */}
              {invSec && (
                <>
                  <tr className="bg-muted/30 font-bold text-primary">
                    <td colSpan={hasCompare ? 4 : 2} className="px-3 py-2 uppercase tracking-wide">
                      {invSec.label}
                    </td>
                  </tr>
                  {invSec.rows.map((row) => (
                    <tr key={row.key} className="hover:bg-muted/20">
                      <td className="p-3 pl-6 text-foreground">{row.name}</td>
                      <td className="p-3 text-right">{renderAmount(row.amount)}</td>
                      {hasCompare && (
                        <>
                          <td className="p-3 text-right text-muted-foreground">
                            {renderAmount(row.compare_amount)}
                          </td>
                          <td className="p-3 text-right">
                            {renderDiffPercent(row.amount, row.compare_amount)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold border-b border-border">
                    <td className="p-3 pl-6 font-bold">Arus Kas Bersih dari Aktivitas Investasi</td>
                    <td className="p-3 text-right font-bold font-mono">
                      {renderAmount(invSec.total)}
                    </td>
                    {hasCompare && (
                      <>
                        <td className="p-3 text-right font-bold text-muted-foreground">
                          {renderAmount(invSec.compare_total)}
                        </td>
                        <td className="p-3 text-right">
                          {renderDiffPercent(invSec.total, invSec.compare_total)}
                        </td>
                      </>
                    )}
                  </tr>
                </>
              )}

              {/* Section 3: Aktivitas Pendanaan */}
              {finSec && (
                <>
                  <tr className="bg-muted/30 font-bold text-primary">
                    <td colSpan={hasCompare ? 4 : 2} className="px-3 py-2 uppercase tracking-wide">
                      {finSec.label}
                    </td>
                  </tr>
                  {finSec.rows.map((row) => (
                    <tr key={row.key} className="hover:bg-muted/20">
                      <td className="p-3 pl-6 text-foreground">{row.name}</td>
                      <td className="p-3 text-right">{renderAmount(row.amount)}</td>
                      {hasCompare && (
                        <>
                          <td className="p-3 text-right text-muted-foreground">
                            {renderAmount(row.compare_amount)}
                          </td>
                          <td className="p-3 text-right">
                            {renderDiffPercent(row.amount, row.compare_amount)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold border-b border-border">
                    <td className="p-3 pl-6 font-bold">Arus Kas Bersih dari Aktivitas Pendanaan</td>
                    <td className="p-3 text-right font-bold font-mono">
                      {renderAmount(finSec.total)}
                    </td>
                    {hasCompare && (
                      <>
                        <td className="p-3 text-right font-bold text-muted-foreground">
                          {renderAmount(finSec.compare_total)}
                        </td>
                        <td className="p-3 text-right">
                          {renderDiffPercent(finSec.total, finSec.compare_total)}
                        </td>
                      </>
                    )}
                  </tr>
                </>
              )}

              {/* Ringkasan Kas Akhir */}
              <tr className="bg-muted/60 font-bold">
                <td className="p-3 font-bold text-foreground">
                  Kenaikan (Penurunan) Bersih Kas & Bank
                </td>
                <td className="p-3 text-right font-bold font-mono text-sm">
                  {renderAmount(totals.net_change)}
                </td>
                {hasCompare && (
                  <>
                    <td className="p-3 text-right font-bold text-muted-foreground">
                      {renderAmount(totals.compare_net_change)}
                    </td>
                    <td className="p-3 text-right">
                      {renderDiffPercent(totals.net_change, totals.compare_net_change)}
                    </td>
                  </>
                )}
              </tr>
              <tr>
                <td className="p-3 pl-6 text-muted-foreground">
                  Kas dan Setara Kas pada Awal Periode
                </td>
                <td className="p-3 text-right font-mono">
                  {renderAmount(totals.opening_cash)}
                </td>
                {hasCompare && (
                  <>
                    <td className="p-3 text-right text-muted-foreground">
                      {renderAmount(totals.compare_opening_cash)}
                    </td>
                    <td className="p-3 text-right">-</td>
                  </>
                )}
              </tr>
              <tr className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <td className="p-3 pl-6 text-primary flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Kas dan Setara Kas pada Akhir Periode
                </td>
                <td className="p-3 text-right font-bold font-mono text-sm text-primary">
                  {renderAmount(totals.closing_cash)}
                </td>
                {hasCompare && (
                  <>
                    <td className="p-3 text-right font-bold text-muted-foreground">
                      {renderAmount(totals.compare_closing_cash)}
                    </td>
                    <td className="p-3 text-right">
                      {renderDiffPercent(totals.closing_cash, totals.compare_closing_cash)}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Kotak Edukasi: Kenapa laba berbeda dari arus kas? */}
      <Card className="p-5 border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/40 text-xs text-slate-800 dark:text-slate-200 space-y-3">
        <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300 text-sm">
          <HelpCircle className="h-4 w-4" />
          Kenapa Laba Bersih Berbeda dari Arus Kas?
        </div>
        <p className="leading-relaxed">
          Laporan Laba Rugi menggunakan <strong>prinsip akrual</strong>: pendapatan diakui ketika pesanan selesai diproduksi dan dikirim, serta beban diakui ketika bahan atau jasa dipakai. Sebaliknya, <strong>Laporan Arus Kas</strong> hanya mencatat uang tunai dan saldo bank yang benar-benar berpindah tangan saat transaksi terjadi.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30 space-y-1">
            <span className="font-semibold text-blue-950 dark:text-blue-200 block">
              1. Pengaruh Pembelian Persediaan Bahan:
            </span>
            <p className="text-muted-foreground leading-relaxed">
              Saat Anda membeli kain Rp 6.000.000, kas bank langsung berkurang Rp 6.000.000 (arus kas keluar). Namun, uang itu belum menjadi beban di Laba Rugi, melainkan menjadi aset Persediaan. Beban baru diakui (sebagai HPP) saat kain dipakai dan periode ditutup. Jika belanja bahan lebih besar daripada pemakaian bulan ini, kas akan turun jauh lebih banyak daripada penurunan laba.
            </p>
          </div>
          <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30 space-y-1">
            <span className="font-semibold text-blue-950 dark:text-blue-200 block">
              2. Pengaruh Uang Muka (DP) Pelanggan:
            </span>
            <p className="text-muted-foreground leading-relaxed">
              Ketika pelanggan mentransfer DP atau pelunasan sebelum pesanan dikirim, kas masuk secara riil (arus kas positif). Akan tetapi, di Laba Rugi uang tersebut belum diakui sebagai pendapatan, melainkan dicatat sebagai Liabilitas (Uang Muka Pelanggan) sampai barang selesai dikirim ke pelanggan.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
