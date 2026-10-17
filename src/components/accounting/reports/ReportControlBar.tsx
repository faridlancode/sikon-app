import React from 'react';
import {
  Calendar,
  Layers,
  Printer,
  Download,
  SlidersHorizontal,
} from 'lucide-react';
import Card from '../../ui/card';
import Button from '../../ui/button';

export type PeriodPreset =
  | 'current_month'
  | 'last_month'
  | 'current_quarter'
  | 'ytd'
  | 'last_year'
  | 'custom';

export type ComparisonType =
  | 'none'
  | 'prev_period'
  | 'same_period_last_year'
  | 'last_month_end'
  | 'last_year_end'
  | 'custom';

export type ReportType =
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'equity_changes'
  | 'notes';

interface ReportControlBarProps {
  reportType: ReportType;
  preset: PeriodPreset;
  onPresetChange: (preset: PeriodPreset) => void;
  // Dates
  from: string;
  to: string;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
  asOf: string;
  onAsOfChange: (val: string) => void;
  // Comparison
  comparison: ComparisonType;
  onComparisonChange: (type: ComparisonType) => void;
  compareFrom: string;
  compareTo: string;
  onCompareFromChange: (val: string) => void;
  onCompareToChange: (val: string) => void;
  compareAsOf: string;
  onCompareAsOfChange: (val: string) => void;
  // Provisional HPP
  showProvisionalToggle: boolean;
  includeProvisional: boolean;
  onToggleProvisional: (val: boolean) => void;
  // Actions
  onPrint: () => void;
  onPrintFullReport?: () => void;
  onExportCSV: () => void;
}

export default function ReportControlBar({
  reportType,
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  asOf,
  onAsOfChange,
  comparison,
  onComparisonChange,
  compareFrom,
  compareTo,
  onCompareFromChange,
  onCompareToChange,
  compareAsOf,
  onCompareAsOfChange,
  showProvisionalToggle,
  includeProvisional,
  onToggleProvisional,
  onPrint,
  onPrintFullReport,
  onExportCSV,
}: ReportControlBarProps) {
  const isPeriodReport =
    reportType === 'income_statement' ||
    reportType === 'cash_flow' ||
    reportType === 'equity_changes';
  const hasComparison =
    reportType === 'income_statement' ||
    reportType === 'balance_sheet' ||
    reportType === 'cash_flow';

  return (
    <Card className="p-4 border border-border space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Preset & Rentang Tanggal */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mr-1">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Periode:</span>
          </div>

          <select
            value={preset}
            onChange={(e) => onPresetChange(e.target.value as PeriodPreset)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="current_month">Bulan Ini</option>
            <option value="last_month">Bulan Lalu</option>
            <option value="current_quarter">Kuartal Ini</option>
            <option value="ytd">Tahun Berjalan</option>
            <option value="last_year">Tahun Lalu</option>
            <option value="custom">Kustom</option>
          </select>

          {/* Input Tanggal Kustom atau Input Nilai Saat Ini */}
          {isPeriodReport ? (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                disabled={preset !== 'custom'}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:bg-muted/50 disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                title="Tanggal Awal"
              />
              <span className="text-muted-foreground">s/d</span>
              <input
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                disabled={preset !== 'custom'}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:bg-muted/50 disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                title="Tanggal Akhir"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Per tanggal:</span>
              <input
                type="date"
                value={asOf}
                onChange={(e) => onAsOfChange(e.target.value)}
                disabled={preset !== 'custom'}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:bg-muted/50 disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                title="Per Tanggal Laporan"
              />
            </div>
          )}

          {/* Pembanding */}
          {hasComparison && (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
              <span className="text-xs font-semibold text-muted-foreground">Bandingkan:</span>
              <select
                value={comparison}
                onChange={(e) => onComparisonChange(e.target.value as ComparisonType)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="none">Tanpa Pembanding</option>
                {isPeriodReport ? (
                  <>
                    <option value="prev_period">Periode Sebelumnya yang Setara</option>
                    <option value="same_period_last_year">Periode Sama Tahun Lalu</option>
                    <option value="custom">Kustom</option>
                  </>
                ) : (
                  <>
                    <option value="last_month_end">Akhir Bulan Lalu</option>
                    <option value="last_year_end">Akhir Tahun Lalu</option>
                    <option value="custom">Kustom</option>
                  </>
                )}
              </select>

              {comparison === 'custom' && (
                isPeriodReport ? (
                  <div className="flex items-center gap-1 text-xs">
                    <input
                      type="date"
                      value={compareFrom}
                      onChange={(e) => onCompareFromChange(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      title="Tanggal Awal Pembanding"
                    />
                    <span className="text-muted-foreground">s/d</span>
                    <input
                      type="date"
                      value={compareTo}
                      onChange={(e) => onCompareToChange(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      title="Tanggal Akhir Pembanding"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs">
                    <input
                      type="date"
                      value={compareAsOf}
                      onChange={(e) => onCompareAsOfChange(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      title="Per Tanggal Neraca Pembanding"
                    />
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Action Buttons: Unduh CSV, Cetak, dan Laporan Lengkap PDF */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCSV}
            className="h-8 gap-1.5 text-xs"
            title="Unduh laporan dalam format CSV (pemisah titik koma untuk Excel)"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onPrint}
            className="h-8 gap-1.5 text-xs"
            title="Cetak atau simpan laporan sebagai dokumen PDF"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak
          </Button>

          {onPrintFullReport && (
            <Button
              variant="default"
              size="sm"
              onClick={onPrintFullReport}
              className="h-8 gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              title="Buka seluruh rangkaian laporan keuangan resmi lengkap untuk dicetak / disimpan PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              Laporan Lengkap (PDF)
            </Button>
          )}
        </div>
      </div>

      {/* Toggle Estimasi HPP (Hanya tampil bila relevan) */}
      {showProvisionalToggle && (
        <div className="flex items-center justify-between border-t border-border pt-2.5 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeProvisional}
              onChange={(e) => onToggleProvisional(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="font-medium text-foreground">
              Sertakan estimasi penyesuaian HPP bahan baku (berdasarkan nilai stok fisik terkini)
            </span>
          </label>
          <span className="text-[11px] text-muted-foreground italic">
            Default aktif untuk periode berjalan yang belum ditutup
          </span>
        </div>
      )}
    </Card>
  );
}
