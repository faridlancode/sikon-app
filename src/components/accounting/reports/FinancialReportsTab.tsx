import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Scale,
  Activity,
  Layers,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Button from '../../ui/button';
import ReportControlBar, {
  PeriodPreset,
  ComparisonType,
  ReportType,
} from './ReportControlBar';
import ReportStatusBanner from './ReportStatusBanner';
import IncomeStatementView from './IncomeStatementView';
import BalanceSheetView from './BalanceSheetView';
import CashFlowView from './CashFlowView';
import EquityChangesView from './EquityChangesView';
import ReportNotesView from './ReportNotesView';
import PrintReportModal from './PrintReportModal';
import { useFinancialStatements } from '../../../hooks/useFinancialStatements';
import {
  todayISO,
  startOfMonthISO,
  endOfMonthISO,
  startOfLastMonthISO,
  endOfLastMonthISO,
  startOfQuarterISO,
  endOfQuarterISO,
  startOfYearISO,
  endOfYearISO,
  startOfLastYearISO,
  endOfLastYearISO,
  formatLocalDateISO,
} from '../../../utils/dateHelpers';
import type {
  AccountingSettings,
  IncomeStatementReport,
  BalanceSheetReport,
  CashFlowReport,
  EquityChangesReport,
  ReportNotesData,
} from '../../../types';

interface FinancialReportsTabProps {
  settings: AccountingSettings | null;
  onOpenLedger: (accountId: string, from: string, to: string) => void;
  onGoToClosing: () => void;
  onGoToSuspense: () => void;
  suspenseBalance?: number;
}

export default function FinancialReportsTab({
  settings,
  onOpenLedger,
  onGoToClosing,
  onGoToSuspense,
  suspenseBalance = 0,
}: FinancialReportsTabProps) {
  const [subTab, setSubTab] = useState<ReportType>('income_statement');

  // Control state
  const [preset, setPreset] = useState<PeriodPreset>('current_month');
  const [from, setFrom] = useState<string>(startOfMonthISO());
  const [to, setTo] = useState<string>(endOfMonthISO());
  const [asOf, setAsOf] = useState<string>(todayISO());

  // Comparison state
  const [comparison, setComparison] = useState<ComparisonType>('none');
  const [compareFrom, setCompareFrom] = useState<string>('');
  const [compareTo, setCompareTo] = useState<string>('');
  const [compareAsOf, setCompareAsOf] = useState<string>('');

  // Provisional HPP toggle (default aktif)
  const [includeProvisional, setIncludeProvisional] = useState<boolean>(true);

  // Data & loading state
  const [pnlReport, setPnlReport] = useState<IncomeStatementReport | null>(null);
  const [bsReport, setBsReport] = useState<BalanceSheetReport | null>(null);
  const [cfReport, setCfReport] = useState<CashFlowReport | null>(null);
  const [eqReport, setEqReport] = useState<EquityChangesReport | null>(null);
  const [notesReport, setNotesReport] = useState<ReportNotesData | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Print modal
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);

  const {
    getIncomeStatement,
    getBalanceSheet,
    getCashFlow,
    getEquityChanges,
    getReportNotes,
  } = useFinancialStatements();

  // Helper untuk mengubah tanggal saat preset periode berubah
  const handlePresetChange = useCallback((newPreset: PeriodPreset) => {
    setPreset(newPreset);
    const now = new Date();

    if (newPreset === 'current_month') {
      const f = startOfMonthISO(now);
      const t = endOfMonthISO(now);
      setFrom(f);
      setTo(t);
      setAsOf(todayISO());
    } else if (newPreset === 'last_month') {
      const f = startOfLastMonthISO(now);
      const t = endOfLastMonthISO(now);
      setFrom(f);
      setTo(t);
      setAsOf(t);
    } else if (newPreset === 'current_quarter') {
      const f = startOfQuarterISO(now);
      const t = endOfQuarterISO(now);
      setFrom(f);
      setTo(t);
      setAsOf(todayISO());
    } else if (newPreset === 'ytd') {
      const f = startOfYearISO(now);
      const t = endOfMonthISO(now);
      setFrom(f);
      setTo(t);
      setAsOf(todayISO());
    } else if (newPreset === 'last_year') {
      const f = startOfLastYearISO(now);
      const t = endOfLastYearISO(now);
      setFrom(f);
      setTo(t);
      setAsOf(t);
    }
  }, []);

  // Update tanggal pembanding otomatis saat comparison atau periode berubah
  useEffect(() => {
    if (subTab === 'income_statement' || subTab === 'cash_flow') {
      if (comparison === 'prev_period') {
        const fromD = new Date(`${from}T00:00:00`);
        const toD = new Date(`${to}T00:00:00`);
        const diffMs = toD.getTime() - fromD.getTime();
        const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

        const newToD = new Date(fromD);
        newToD.setDate(newToD.getDate() - 1);
        const newFromD = new Date(newToD);
        newFromD.setDate(newFromD.getDate() - days + 1);

        setCompareFrom(formatLocalDateISO(newFromD));
        setCompareTo(formatLocalDateISO(newToD));
      } else if (comparison === 'same_period_last_year') {
        const fromD = new Date(`${from}T00:00:00`);
        const toD = new Date(`${to}T00:00:00`);
        fromD.setFullYear(fromD.getFullYear() - 1);
        toD.setFullYear(toD.getFullYear() - 1);
        setCompareFrom(formatLocalDateISO(fromD));
        setCompareTo(formatLocalDateISO(toD));
      } else if (comparison === 'none') {
        setCompareFrom('');
        setCompareTo('');
      }
    } else if (subTab === 'balance_sheet') {
      if (comparison === 'last_month_end') {
        setCompareAsOf(endOfLastMonthISO(new Date()));
      } else if (comparison === 'last_year_end') {
        setCompareAsOf(endOfLastYearISO(new Date()));
      } else if (comparison === 'none') {
        setCompareAsOf('');
      }
    }
  }, [subTab, comparison, from, to, asOf]);

  // Load report data
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (subTab === 'income_statement') {
        const cmpF = comparison !== 'none' ? compareFrom : null;
        const cmpT = comparison !== 'none' ? compareTo : null;
        const data = await getIncomeStatement(
          from,
          to,
          cmpF,
          cmpT,
          includeProvisional
        );
        setPnlReport(data);
      } else if (subTab === 'balance_sheet') {
        const cmpAsOf = comparison !== 'none' ? compareAsOf : null;
        const data = await getBalanceSheet(asOf, cmpAsOf, includeProvisional);
        setBsReport(data);
      } else if (subTab === 'cash_flow') {
        const cmpF = comparison !== 'none' ? compareFrom : null;
        const cmpT = comparison !== 'none' ? compareTo : null;
        const data = await getCashFlow(from, to, cmpF, cmpT);
        setCfReport(data);
      } else if (subTab === 'equity_changes') {
        const data = await getEquityChanges(from, to, includeProvisional);
        setEqReport(data);
      } else if (subTab === 'notes') {
        const data = await getReportNotes(asOf);
        setNotesReport(data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memuat laporan keuangan.');
    } finally {
      setLoading(false);
    }
  }, [
    subTab,
    from,
    to,
    asOf,
    comparison,
    compareFrom,
    compareTo,
    compareAsOf,
    includeProvisional,
    getIncomeStatement,
    getBalanceSheet,
    getCashFlow,
    getEquityChanges,
    getReportNotes,
  ]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Ekspor CSV: pemisah titik koma (;), UTF-8 dengan BOM (\uFEFF), angka mentah
  function handleExportCSV() {
    let csvContent = '\uFEFF'; // UTF-8 BOM agar rapi di Microsoft Excel

    if (subTab === 'income_statement' && pnlReport) {
      csvContent += `LAPORAN LABA RUGI\n`;
      csvContent += `Periode;${pnlReport.meta.from};s/d;${pnlReport.meta.to}\n`;
      csvContent += `Status;${pnlReport.meta.status}\n\n`;

      csvContent += `Kelompok;Kode Akun;Nama Akun;Jumlah (Rp);Pembanding (Rp);Selisih (Rp)\n`;

      pnlReport.sections.forEach((sec) => {
        sec.rows.forEach((row) => {
          const diff =
            row.compare_amount !== null && row.compare_amount !== undefined
              ? row.amount - row.compare_amount
              : '';
          csvContent += `"${sec.label}";"${row.code || ''}";"${row.name}";${row.amount};${
            row.compare_amount ?? ''
          };${diff}\n`;
        });
        csvContent += `"${sec.label} - Subtotal";"";"";${sec.total};${
          sec.compare_total ?? ''
        };${
          sec.compare_total !== null && sec.compare_total !== undefined
            ? sec.total - sec.compare_total
            : ''
        }\n`;
      });

      csvContent += `\n"TOTAL";"";"LABA KOTOR";${pnlReport.totals.gross_profit};${
        pnlReport.totals.compare_gross_profit ?? ''
      };${
        pnlReport.totals.compare_gross_profit !== null &&
        pnlReport.totals.compare_gross_profit !== undefined
          ? pnlReport.totals.gross_profit - pnlReport.totals.compare_gross_profit
          : ''
      }\n`;

      csvContent += `"TOTAL";"";"LABA BERSIH";${pnlReport.totals.net_profit};${
        pnlReport.totals.compare_net_profit ?? ''
      };${
        pnlReport.totals.compare_net_profit !== null &&
        pnlReport.totals.compare_net_profit !== undefined
          ? pnlReport.totals.net_profit - pnlReport.totals.compare_net_profit
          : ''
      }\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laba_Rugi_${pnlReport.meta.from}_sd_${pnlReport.meta.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (subTab === 'balance_sheet' && bsReport) {
      csvContent += `NERACA KEUANGAN\n`;
      csvContent += `Per Tanggal;${bsReport.meta.as_of}\n`;
      csvContent += `Status;${bsReport.meta.status}\n\n`;

      csvContent += `Kelompok;Kode Akun;Nama Akun;Jumlah (Rp);Pembanding (Rp);Selisih (Rp)\n`;

      bsReport.sections.forEach((sec) => {
        sec.rows.forEach((row) => {
          const diff =
            row.compare_amount !== null && row.compare_amount !== undefined
              ? row.amount - row.compare_amount
              : '';
          csvContent += `"${sec.label}";"${row.code || ''}";"${row.name}";${row.amount};${
            row.compare_amount ?? ''
          };${diff}\n`;
        });
        csvContent += `"${sec.label} - Subtotal";"";"";${sec.total};${
          sec.compare_total ?? ''
        };${
          sec.compare_total !== null && sec.compare_total !== undefined
            ? sec.total - sec.compare_total
            : ''
        }\n`;
      });

      csvContent += `\n"TOTAL";"";"TOTAL ASET";${bsReport.totals.total_assets};"";""\n`;
      csvContent += `"TOTAL";"";"TOTAL LIABILITAS & EKUITAS";${bsReport.totals.total_liabilities_and_equity};"";""\n`;
      csvContent += `"KONTROL";"";"SELISIH";${bsReport.totals.difference};"";""\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Neraca_Keuangan_${bsReport.meta.as_of}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (subTab === 'cash_flow' && cfReport) {
      csvContent += `LAPORAN ARUS KAS (METODE LANGSUNG)\n`;
      csvContent += `Periode;${cfReport.meta.from};s/d;${cfReport.meta.to}\n`;
      csvContent += `Status;${cfReport.meta.status}\n\n`;

      csvContent += `Kelompok Aktivitas;Keterangan;Jumlah (Rp);Pembanding (Rp);Selisih (Rp)\n`;

      cfReport.sections.forEach((sec) => {
        sec.rows.forEach((row) => {
          const diff =
            row.compare_amount !== null && row.compare_amount !== undefined
              ? row.amount - row.compare_amount
              : '';
          csvContent += `"${sec.label}";"${row.name}";${row.amount};${
            row.compare_amount ?? ''
          };${diff}\n`;
        });
        csvContent += `"${sec.label} - Subtotal";"";${sec.total};${
          sec.compare_total ?? ''
        };${
          sec.compare_total !== null && sec.compare_total !== undefined
            ? sec.total - sec.compare_total
            : ''
        }\n`;
      });

      csvContent += `\n"TOTAL";"KENAIKAN (PENURUNAN) BERSIH KAS & BANK";${cfReport.totals.net_change};"";""\n`;
      csvContent += `"TOTAL";"KAS AWAL PERIODE";${cfReport.totals.opening_cash};"";""\n`;
      csvContent += `"TOTAL";"KAS AKHIR PERIODE";${cfReport.totals.closing_cash};"";""\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Arus_Kas_${cfReport.meta.from}_sd_${cfReport.meta.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (subTab === 'equity_changes' && eqReport) {
      csvContent += `LAPORAN PERUBAHAN EKUITAS\n`;
      csvContent += `Periode;${eqReport.meta.from};s/d;${eqReport.meta.to}\n`;
      csvContent += `Status;${eqReport.meta.status}\n\n`;

      csvContent += `Komponen Ekuitas;Jumlah (Rp)\n`;
      eqReport.rows.forEach((row) => {
        csvContent += `"${row.label}";${row.amount}\n`;
      });

      csvContent += `\n"UJI SILANG";"EKUITAS AKHIR DI NERACA";${eqReport.totals.balance_sheet_equity}\n`;
      csvContent += `"UJI SILANG";"SELISIH";${eqReport.totals.difference}\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Perubahan_Ekuitas_${eqReport.meta.from}_sd_${eqReport.meta.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (subTab === 'notes' && notesReport) {
      csvContent += `CATATAN ATAS LAPORAN KEUANGAN (CALK)\n`;
      csvContent += `Per Tanggal;${asOf}\n\n`;

      csvContent += `1. KAS DAN BANK\nKode;Nama Akun;Saldo (Rp)\n`;
      notesReport.cash_and_banks.rows.forEach((r) => {
        csvContent += `"${r.code}";"${r.name}";${r.amount}\n`;
      });
      csvContent += `"TOTAL KAS & BANK";"";${notesReport.cash_and_banks.total}\n\n`;

      csvContent += `2. PERSEDIAAN BAHAN BAKU\nNama Material;Satuan;Stok;Harga Beli Terakhir;Nilai Total (Rp)\n`;
      notesReport.inventories.rows.forEach((r) => {
        csvContent += `"${r.name}";"${r.unit || ''}";${r.stock_qty ?? 0};${r.price ?? 0};${r.total_value ?? 0}\n`;
      });
      csvContent += `"TOTAL PERSEDIAAN";"";"";"";${notesReport.inventories.total}\n\n`;

      csvContent += `3. JADWAL ASET TETAP\nKelas Aset;Jumlah Unit;Harga Perolehan;Akumulasi Penyusutan;Nilai Buku (Rp)\n`;
      notesReport.fixed_assets.rows.forEach((r) => {
        csvContent += `"${r.label}";${r.count};${r.cost};${r.accumulated};${r.book_value}\n`;
      });
      csvContent += `"TOTAL ASET TETAP";"";${notesReport.fixed_assets.totals.cost};${notesReport.fixed_assets.totals.accumulated};${notesReport.fixed_assets.totals.book_value}\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Catatan_Laporan_Keuangan_${asOf}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Tentukan apakah periode saat ini terkunci
  const currentStatus =
    subTab === 'income_statement'
      ? pnlReport?.meta.status || 'open_estimate'
      : subTab === 'balance_sheet'
      ? bsReport?.meta.status || 'open_estimate'
      : subTab === 'cash_flow'
      ? cfReport?.meta.status || 'open'
      : subTab === 'equity_changes'
      ? eqReport?.meta.status || 'open_estimate'
      : 'open_estimate';

  const showProvisionalToggle =
    currentStatus !== 'locked' &&
    (subTab === 'income_statement' ||
      subTab === 'balance_sheet' ||
      subTab === 'equity_changes');

  // Handler membuka route cetak lengkap di tab baru
  function handleOpenFullPrint() {
    const params = new URLSearchParams({
      from,
      to,
      as_of: asOf,
      include_provisional: String(includeProvisional),
    });
    window.open(`/akuntansi/cetak?${params.toString()}`, '_blank');
  }

  return (
    <div className="space-y-5">
      {/* Sub-Tab Navigation: 5 Laporan Keuangan Lengkap */}
      <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 gap-2">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <Button
            variant={subTab === 'income_statement' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('income_statement')}
            className="gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Laba Rugi
          </Button>

          <Button
            variant={subTab === 'balance_sheet' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('balance_sheet')}
            className="gap-1.5 text-xs font-semibold"
          >
            <Scale className="h-4 w-4" />
            Neraca
          </Button>

          <Button
            variant={subTab === 'cash_flow' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('cash_flow')}
            className="gap-1.5 text-xs font-semibold"
          >
            <Activity className="h-4 w-4" />
            Arus Kas
          </Button>

          <Button
            variant={subTab === 'equity_changes' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('equity_changes')}
            className="gap-1.5 text-xs font-semibold"
          >
            <Layers className="h-4 w-4" />
            Perubahan Ekuitas
          </Button>

          <Button
            variant={subTab === 'notes' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('notes')}
            className="gap-1.5 text-xs font-semibold"
          >
            <FileText className="h-4 w-4" />
            Catatan (CALK)
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={loadReports}
          disabled={loading}
          className="h-8 gap-1.5 text-xs text-muted-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Segarkan Data
        </Button>
      </div>

      {/* Control Bar: Preset, Rentang, Pembanding, Toggle Estimasi, Unduh & Cetak */}
      <ReportControlBar
        reportType={subTab}
        preset={preset}
        onPresetChange={handlePresetChange}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        asOf={asOf}
        onAsOfChange={setAsOf}
        comparison={comparison}
        onComparisonChange={setComparison}
        compareFrom={compareFrom}
        compareTo={compareTo}
        onCompareFromChange={setCompareFrom}
        onCompareToChange={setCompareTo}
        compareAsOf={compareAsOf}
        onCompareAsOfChange={setCompareAsOf}
        showProvisionalToggle={showProvisionalToggle}
        includeProvisional={includeProvisional}
        onToggleProvisional={setIncludeProvisional}
        onPrint={() => setPrintModalOpen(true)}
        onPrintFullReport={handleOpenFullPrint}
        onExportCSV={handleExportCSV}
      />

      {/* Status Banner sesuai §6.2 */}
      {subTab === 'income_statement' && pnlReport && (
        <ReportStatusBanner
          status={pnlReport.meta.status}
          lockedThrough={pnlReport.meta.locked_through}
          provisional={pnlReport.meta.provisional}
          suspenseBalance={suspenseBalance}
          onGoToClosing={onGoToClosing}
          onGoToSuspense={onGoToSuspense}
        />
      )}

      {subTab === 'balance_sheet' && bsReport && (
        <ReportStatusBanner
          status={bsReport.meta.status}
          lockedThrough={bsReport.meta.locked_through}
          provisional={bsReport.meta.provisional}
          balanced={bsReport.meta.balanced}
          suspenseBalance={suspenseBalance}
          onGoToClosing={onGoToClosing}
          onGoToSuspense={onGoToSuspense}
        />
      )}

      {subTab === 'cash_flow' && cfReport && (
        <ReportStatusBanner
          status={cfReport.meta.status}
          lockedThrough={settings?.locked_through}
          reconciled={cfReport.meta.reconciled}
          suspenseBalance={suspenseBalance}
          onGoToClosing={onGoToClosing}
          onGoToSuspense={onGoToSuspense}
        />
      )}

      {subTab === 'equity_changes' && eqReport && (
        <ReportStatusBanner
          status={eqReport.meta.status}
          lockedThrough={settings?.locked_through}
          provisional={eqReport.meta.provisional ?? undefined}
          reconciled={eqReport.meta.reconciled}
          suspenseBalance={suspenseBalance}
          onGoToClosing={onGoToClosing}
          onGoToSuspense={onGoToSuspense}
        />
      )}

      {/* Loading & Error */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Menghitung laporan akuntansi...</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-4 text-xs font-medium text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Report Content Views */}
      {!loading && !error && (
        <>
          {subTab === 'income_statement' && pnlReport && (
            <IncomeStatementView
              report={pnlReport}
              onOpenLedger={onOpenLedger}
            />
          )}

          {subTab === 'balance_sheet' && bsReport && (
            <BalanceSheetView
              report={bsReport}
              booksStartDate={settings?.books_start_date ?? null}
              onOpenLedger={onOpenLedger}
            />
          )}

          {subTab === 'cash_flow' && cfReport && (
            <CashFlowView report={cfReport} />
          )}

          {subTab === 'equity_changes' && eqReport && (
            <EquityChangesView report={eqReport} />
          )}

          {subTab === 'notes' && notesReport && (
            <ReportNotesView data={notesReport} asOf={asOf} />
          )}
        </>
      )}

      {/* Modal Cetak Layar Penuh (Per Laporan) */}
      <PrintReportModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        reportType={subTab}
        pnlReport={pnlReport}
        bsReport={bsReport}
        cfReport={cfReport}
        eqReport={eqReport}
        notesReport={notesReport}
        asOfDate={asOf}
      />
    </div>
  );
}
