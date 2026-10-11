import React from 'react';
import {
  Briefcase,
  Layers,
  Percent,
  CheckCircle2,
  AlertOctagon,
  ExternalLink,
} from 'lucide-react';
import Card from '../../ui/card';
import { formatIDR } from '../../../utils/formatCurrency';
import type { BalanceSheetReport, ReportSection, ReportRow } from '../../../types';

interface BalanceSheetViewProps {
  report: BalanceSheetReport;
  booksStartDate: string | null;
  onOpenLedger: (accountId: string, from: string, to: string) => void;
}

export default function BalanceSheetView({
  report,
  booksStartDate,
  onOpenLedger,
}: BalanceSheetViewProps) {
  const { meta, sections, totals } = report;
  const hasCompare =
    meta.compare_as_of !== null &&
    meta.compare_as_of !== undefined &&
    meta.compare_as_of !== '';

  const ledgerFrom = booksStartDate || '2026-01-01';

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

  // Cari seksi-seksi
  const currAssetsSec = sections.find((s) => s.key === 'current_assets');
  const fixedAssetsSec = sections.find((s) => s.key === 'fixed_assets');
  const liabSec = sections.find((s) => s.key === 'liabilities');
  const equitySec = sections.find((s) => s.key === 'equity');

  function renderSectionTable(sec?: ReportSection, subtotalLabel?: string) {
    if (!sec) return null;
    const cmpTotal = sec.compare_total;
    const diffRp =
      cmpTotal !== null && cmpTotal !== undefined ? sec.total - cmpTotal : null;

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="font-semibold text-xs text-primary uppercase tracking-wider">
            {sec.label}
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {renderAmount(sec.total)}
          </span>
        </div>

        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-border">
            {sec.rows.length === 0 ? (
              <tr>
                <td colSpan={hasCompare ? 5 : 2} className="p-3 text-center text-muted-foreground italic text-[11px]">
                  Tidak ada saldo pada kelompok ini.
                </td>
              </tr>
            ) : (
              sec.rows.map((row, idx) => {
                const rowDiffRp =
                  row.compare_amount !== null && row.compare_amount !== undefined
                    ? row.amount - row.compare_amount
                    : null;

                return (
                  <tr key={row.account_id || `${sec.key}-${idx}`} className="hover:bg-muted/10 transition-colors">
                    <td className="p-2.5">
                      {row.account_id ? (
                        <button
                          onClick={() => onOpenLedger(row.account_id!, ledgerFrom, meta.as_of)}
                          className="group flex items-center gap-1.5 text-left font-medium text-foreground hover:text-primary transition-colors"
                          title="Buka Buku Besar sampai tanggal neraca"
                        >
                          {row.code && (
                            <span className="font-mono text-muted-foreground mr-1 text-[11px]">
                              {row.code}
                            </span>
                          )}
                          <span>{row.name}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                        </button>
                      ) : (
                        <span className="font-semibold text-foreground">
                          {row.name}
                        </span>
                      )}
                    </td>

                    <td className="p-2.5 text-right w-32">
                      {renderAmount(row.amount)}
                    </td>

                    {hasCompare && (
                      <>
                        <td className="p-2.5 text-right w-28 text-muted-foreground">
                          {renderAmount(row.compare_amount)}
                        </td>
                        <td className="p-2.5 text-right w-28 font-mono">
                          {rowDiffRp !== null ? renderAmount(rowDiffRp) : '-'}
                        </td>
                        <td className="p-2.5 text-right w-20">
                          {renderDiffPercent(row.amount, row.compare_amount)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>

          {subtotalLabel && (
            <tfoot className="border-t border-border bg-muted/20 font-semibold">
              <tr>
                <td className="p-2.5 text-muted-foreground text-[11px] uppercase tracking-wider">
                  {subtotalLabel}
                </td>
                <td className="p-2.5 text-right font-mono font-bold text-foreground">
                  {renderAmount(sec.total)}
                </td>
                {hasCompare && (
                  <>
                    <td className="p-2.5 text-right font-mono">
                      {renderAmount(cmpTotal)}
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {diffRp !== null ? renderAmount(diffRp) : '-'}
                    </td>
                    <td className="p-2.5 text-right">
                      {renderDiffPercent(sec.total, cmpTotal)}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Kartu Indikator Keuangan (Modal Kerja & Rasio Lancar) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Aset */}
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Total Aset
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold font-mono text-foreground">
            {formatIDR(totals.total_assets)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Aset Lancar + Aset Tetap
          </p>
        </Card>

        {/* Modal Kerja Bersih */}
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Modal Kerja Bersih (Working Capital)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <p
            className={`mt-2 text-xl font-bold font-mono ${
              totals.working_capital < 0 ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {totals.working_capital < 0
              ? `(${formatIDR(Math.abs(totals.working_capital))})`
              : formatIDR(totals.working_capital)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Aset Lancar dikurangi Liabilitas Lancar
          </p>
        </Card>

        {/* Rasio Lancar */}
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Rasio Lancar (Current Ratio)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-xl font-bold font-mono text-primary">
              {totals.current_ratio !== null && totals.current_ratio !== undefined
                ? `${totals.current_ratio}x`
                : '–'}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Rumus: Aset Lancar / Liabilitas Lancar
          </p>
        </Card>
      </div>

      {/* 2. Format Dua Kolom (Skontro di Desktop, Bertumpuk di Mobile) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Kolom Kiri: ASET */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b-2 border-primary pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
              ASET (AKTIVA)
            </h3>
            <span className="text-xs font-mono font-bold text-primary">
              Per {meta.as_of}
            </span>
          </div>

          {renderSectionTable(currAssetsSec, 'Total Aset Lancar')}
          {renderSectionTable(fixedAssetsSec, 'Total Aset Tetap')}

          {/* TOTAL ASET */}
          <Card className="p-4 border-2 border-primary/30 bg-primary-soft/20 flex items-center justify-between font-bold text-sm">
            <span className="uppercase tracking-wider text-primary">TOTAL ASET</span>
            <span className="font-mono text-primary text-base">
              {renderAmount(totals.total_assets)}
            </span>
          </Card>
        </div>

        {/* Kolom Kanan: LIABILITAS & EKUITAS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b-2 border-primary pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
              LIABILITAS & EKUITAS (PASIVA)
            </h3>
            <span className="text-xs font-mono font-bold text-primary">
              Per {meta.as_of}
            </span>
          </div>

          {renderSectionTable(liabSec, 'Total Liabilitas')}
          {renderSectionTable(equitySec, 'Total Ekuitas')}

          {/* TOTAL LIABILITAS + EKUITAS */}
          <Card className="p-4 border-2 border-primary/30 bg-primary-soft/20 flex items-center justify-between font-bold text-sm">
            <span className="uppercase tracking-wider text-primary">
              TOTAL LIABILITAS & EKUITAS
            </span>
            <span className="font-mono text-primary text-base">
              {renderAmount(totals.total_liabilities_and_equity)}
            </span>
          </Card>
        </div>
      </div>

      {/* 3. Baris Keseimbangan Neraca (Control Bar) */}
      <Card
        className={`p-3.5 border flex items-center justify-between text-xs font-medium ${
          meta.balanced
            ? 'border-success/30 bg-success-soft text-success'
            : 'border-destructive/30 bg-destructive-soft text-destructive'
        }`}
      >
        <div className="flex items-center gap-2">
          {meta.balanced ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertOctagon className="h-4 w-4" />
          )}
          <span>
            {meta.balanced
              ? 'Neraca Seimbang: Total Aset = Total Liabilitas + Total Ekuitas.'
              : 'Neraca Tidak Seimbang!'}
          </span>
        </div>
        <div className="font-mono font-semibold">
          Selisih: {formatIDR(totals.difference)}
        </div>
      </Card>
    </div>
  );
}
