import React, { useState } from 'react';
import {
  TrendingUp,
  Percent,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Coins,
  Scale,
} from 'lucide-react';
import Card from '../../ui/card';
import { formatIDR } from '../../../utils/formatCurrency';
import type { IncomeStatementReport, ReportSection, ReportRow } from '../../../types';

interface IncomeStatementViewProps {
  report: IncomeStatementReport;
  onOpenLedger: (accountId: string, from: string, to: string) => void;
}

export default function IncomeStatementView({
  report,
  onOpenLedger,
}: IncomeStatementViewProps) {
  const { meta, sections, totals } = report;
  const hasCompare =
    meta.compare_from !== null &&
    meta.compare_to !== null &&
    meta.compare_from !== undefined;

  // State lipatan (collapsible) tiap section, default terbuka semua
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  function toggleSection(key: string) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Format angka rupiah dengan warna merah jika negatif
  function renderAmount(val: number | null | undefined, isEstimate = false) {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }
    const isNeg = val < 0;
    return (
      <span
        className={`font-mono tabular-nums ${
          isNeg ? 'text-destructive font-semibold' : 'text-foreground'
        } ${isEstimate ? 'italic' : ''}`}
      >
        {isNeg ? `(${formatIDR(Math.abs(val))})` : formatIDR(val)}
      </span>
    );
  }

  // Format selisih persen
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

  // Cari seksi untuk kartu
  const revSection = sections.find((s) => s.key === 'revenue');
  const revTotal = revSection?.total ?? 0;
  const cmpRevTotal = revSection?.compare_total;

  return (
    <div className="space-y-6">
      {/* 1. Tiga Kartu Metrik Utama */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Kartu Pendapatan */}
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Total Pendapatan Usaha
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold font-mono text-foreground">
            {formatIDR(revTotal)}
          </p>
          {hasCompare && cmpRevTotal !== null && cmpRevTotal !== undefined && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sebelumnya: {formatIDR(cmpRevTotal)}</span>
              {renderDiffPercent(revTotal, cmpRevTotal)}
            </div>
          )}
        </Card>

        {/* Kartu Laba Kotor */}
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Laba Kotor (Gross Profit)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p
              className={`text-xl font-bold font-mono ${
                totals.gross_profit < 0 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {totals.gross_profit < 0
                ? `(${formatIDR(Math.abs(totals.gross_profit))})`
                : formatIDR(totals.gross_profit)}
            </p>
            {totals.gross_margin_pct !== null && totals.gross_margin_pct !== undefined && (
              <span className="inline-flex items-center rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-bold text-success">
                {totals.gross_margin_pct}% margin
              </span>
            )}
          </div>
          {hasCompare && totals.compare_gross_profit !== null && totals.compare_gross_profit !== undefined && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sebelumnya: {formatIDR(totals.compare_gross_profit)}</span>
              {renderDiffPercent(totals.gross_profit, totals.compare_gross_profit)}
            </div>
          )}
        </Card>

        {/* Kartu Laba Bersih */}
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Laba Bersih (Net Profit)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Scale className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p
              className={`text-xl font-bold font-mono ${
                totals.net_profit < 0 ? 'text-destructive' : 'text-primary'
              }`}
            >
              {totals.net_profit < 0
                ? `(${formatIDR(Math.abs(totals.net_profit))})`
                : formatIDR(totals.net_profit)}
            </p>
            {totals.net_margin_pct !== null && totals.net_margin_pct !== undefined && (
              <span className="inline-flex items-center rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-bold text-primary">
                {totals.net_margin_pct}% margin
              </span>
            )}
          </div>
          {hasCompare && totals.compare_net_profit !== null && totals.compare_net_profit !== undefined && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sebelumnya: {formatIDR(totals.compare_net_profit)}</span>
              {renderDiffPercent(totals.net_profit, totals.compare_net_profit)}
            </div>
          )}
        </Card>
      </div>

      {/* 2. Tabel Rincian Berjenjang (Collapsible) */}
      <Card className="overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
              <tr>
                <th className="p-3 w-10"></th>
                <th className="p-3 w-28">Kode</th>
                <th className="p-3">Nama Akun</th>
                <th className="p-3 text-right w-44">
                  Periode Berjalan ({meta.from} s/d {meta.to})
                </th>
                {hasCompare && (
                  <>
                    <th className="p-3 text-right w-40">
                      Pembanding ({meta.compare_from} s/d {meta.compare_to})
                    </th>
                    <th className="p-3 text-right w-36">Selisih (Rp)</th>
                    <th className="p-3 text-right w-24">Selisih (%)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sections.map((sec) => {
                const isCollapsed = !!collapsedSections[sec.key];
                const cmpSecTotal = sec.compare_total;
                const secDiffRp =
                  cmpSecTotal !== null && cmpSecTotal !== undefined
                    ? sec.total - cmpSecTotal
                    : null;

                return (
                  <React.Fragment key={sec.key}>
                    {/* Header Seksi */}
                    <tr
                      onClick={() => toggleSection(sec.key)}
                      className="cursor-pointer bg-muted/40 hover:bg-muted/60 transition-colors select-none font-semibold text-foreground"
                    >
                      <td className="p-2.5 text-center text-muted-foreground">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                      <td colSpan={2} className="p-2.5 uppercase tracking-wider text-[11px] text-primary">
                        {sec.label} ({sec.rows.length} akun)
                      </td>
                      <td className="p-2.5 text-right font-mono text-foreground font-bold">
                        {renderAmount(sec.total)}
                      </td>
                      {hasCompare && (
                        <>
                          <td className="p-2.5 text-right font-mono font-semibold">
                            {renderAmount(cmpSecTotal)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold">
                            {secDiffRp !== null ? renderAmount(secDiffRp) : '-'}
                          </td>
                          <td className="p-2.5 text-right">
                            {renderDiffPercent(sec.total, cmpSecTotal)}
                          </td>
                        </>
                      )}
                    </tr>

                    {/* Baris Akun di Dalam Seksi */}
                    {!isCollapsed &&
                      (sec.rows.length === 0 ? (
                        <tr>
                          <td colSpan={hasCompare ? 7 : 4} className="p-3 text-center text-muted-foreground italic">
                            Tidak ada transaksi pada kelompok ini selama periode laporan.
                          </td>
                        </tr>
                      ) : (
                        sec.rows.map((row, idx) => {
                          const diffRp =
                            row.compare_amount !== null && row.compare_amount !== undefined
                              ? row.amount - row.compare_amount
                              : null;

                          return (
                            <tr
                              key={row.account_id || `${sec.key}-${idx}`}
                              className="hover:bg-muted/10 transition-colors"
                            >
                              <td></td>
                              <td className="p-2.5 font-mono text-muted-foreground">
                                {row.code || '-'}
                              </td>
                              <td className="p-2.5">
                                {row.account_id ? (
                                  <button
                                    onClick={() => onOpenLedger(row.account_id!, meta.from, meta.to)}
                                    className="group flex items-center gap-1.5 text-left font-medium text-foreground hover:text-primary transition-colors"
                                    title="Klik untuk membuka Buku Besar akun ini"
                                  >
                                    <span>{row.name}</span>
                                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                                  </button>
                                ) : (
                                  <span className={row.is_estimate ? 'italic text-amber-700 dark:text-amber-300 font-medium' : 'text-foreground'}>
                                    {row.name}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right">
                                {renderAmount(row.amount, row.is_estimate)}
                              </td>
                              {hasCompare && (
                                <>
                                  <td className="p-2.5 text-right">
                                    {renderAmount(row.compare_amount)}
                                  </td>
                                  <td className="p-2.5 text-right">
                                    {diffRp !== null ? renderAmount(diffRp) : '-'}
                                  </td>
                                  <td className="p-2.5 text-right">
                                    {renderDiffPercent(row.amount, row.compare_amount)}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Total Footer Berjenjang */}
            <tfoot className="border-t-2 border-border divide-y divide-border bg-card font-semibold text-xs">
              {/* Laba Kotor */}
              <tr className="bg-muted/20">
                <td colSpan={3} className="p-3 text-right uppercase tracking-wider font-bold text-foreground">
                  LABA KOTOR
                </td>
                <td className="p-3 text-right font-mono font-bold text-foreground">
                  {renderAmount(totals.gross_profit)}
                </td>
                {hasCompare && (
                  <>
                    <td className="p-3 text-right font-mono font-bold">
                      {renderAmount(totals.compare_gross_profit)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      {totals.compare_gross_profit !== null && totals.compare_gross_profit !== undefined
                        ? renderAmount(totals.gross_profit - totals.compare_gross_profit)
                        : '-'}
                    </td>
                    <td className="p-3 text-right font-bold">
                      {renderDiffPercent(totals.gross_profit, totals.compare_gross_profit)}
                    </td>
                  </>
                )}
              </tr>

              {/* Laba Bersih */}
              <tr className="bg-primary-soft/30 text-primary font-bold text-sm">
                <td colSpan={3} className="p-3.5 text-right uppercase tracking-wider">
                  LABA BERSIH
                </td>
                <td className="p-3.5 text-right font-mono">
                  {renderAmount(totals.net_profit)}
                </td>
                {hasCompare && (
                  <>
                    <td className="p-3.5 text-right font-mono">
                      {renderAmount(totals.compare_net_profit)}
                    </td>
                    <td className="p-3.5 text-right font-mono">
                      {totals.compare_net_profit !== null && totals.compare_net_profit !== undefined
                        ? renderAmount(totals.net_profit - totals.compare_net_profit)
                        : '-'}
                    </td>
                    <td className="p-3.5 text-right">
                      {renderDiffPercent(totals.net_profit, totals.compare_net_profit)}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
