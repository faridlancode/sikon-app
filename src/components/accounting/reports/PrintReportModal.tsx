import React from 'react';
import { X, Printer, Building2 } from 'lucide-react';
import Button from '../../ui/button';
import { formatIDR } from '../../../utils/formatCurrency';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import type {
  IncomeStatementReport,
  BalanceSheetReport,
  CashFlowReport,
  EquityChangesReport,
  ReportNotesData,
} from '../../../types';

interface PrintReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'income_statement' | 'balance_sheet' | 'cash_flow' | 'equity_changes' | 'notes';
  pnlReport: IncomeStatementReport | null;
  bsReport: BalanceSheetReport | null;
  cfReport?: CashFlowReport | null;
  eqReport?: EquityChangesReport | null;
  notesReport?: ReportNotesData | null;
  asOfDate?: string;
}

export default function PrintReportModal({
  isOpen,
  onClose,
  reportType,
  pnlReport,
  bsReport,
  cfReport,
  eqReport,
  notesReport,
  asOfDate,
}: PrintReportModalProps) {
  const { profile } = useCompanySettings();

  if (!isOpen) return null;

  function handlePrint() {
    const originalTitle = document.title;
    document.title = ' ';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  }

  let title = 'LAPORAN KEUANGAN';
  let subtitle = '';

  if (reportType === 'income_statement') {
    title = 'LAPORAN LABA RUGI';
    subtitle = `Periode: ${pnlReport?.meta.from || '-'} s/d ${pnlReport?.meta.to || '-'}`;
  } else if (reportType === 'balance_sheet') {
    title = 'NERACA KEUANGAN';
    subtitle = `Per Tanggal: ${bsReport?.meta.as_of || asOfDate || '-'}`;
  } else if (reportType === 'cash_flow') {
    title = 'LAPORAN ARUS KAS';
    subtitle = `Periode: ${cfReport?.meta.from || '-'} s/d ${cfReport?.meta.to || '-'}`;
  } else if (reportType === 'equity_changes') {
    title = 'LAPORAN PERUBAHAN EKUITAS';
    subtitle = `Periode: ${eqReport?.meta.from || '-'} s/d ${eqReport?.meta.to || '-'}`;
  } else if (reportType === 'notes') {
    title = 'CATATAN ATAS LAPORAN KEUANGAN (CALK)';
    subtitle = `Per Tanggal: ${notesReport?.meta.as_of || asOfDate || '-'}`;
  }

  function renderAmount(val: number | null | undefined) {
    if (val === null || val === undefined) return '-';
    if (val < 0) return `(${formatIDR(Math.abs(val))})`;
    return formatIDR(val);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200 print:static print:p-0 print:m-0 print:bg-transparent print:backdrop-blur-none print:block print:w-full print:h-auto">
      <div className="print-document-modal w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900 print:max-h-none print:overflow-visible print:rounded-none print:shadow-none print:block print:w-full print:m-0 print:border-none">
        {/* Header - Screen Only */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 print:hidden bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Pratinjau Cetak Laporan Keuangan
            </h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              <Printer className="h-4 w-4" />
              Cetak / Simpan PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
              aria-label="Tutup pratinjau cetak"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Print Content Area - Overflow visible during print to prevent cutoff */}
        <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible print:max-h-none print:block">
          <div className="space-y-6">
            {/* Kop Surat Perusahaan */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div className="flex items-center gap-4">
                {profile.logoUrl ? (
                  <img
                    src={profile.logoUrl}
                    alt="Logo"
                    className="h-16 w-16 object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
                    {profile.companyName || 'SIKon Konveksi'}
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {profile.address || 'Alamat Perusahaan'}
                  </p>
                  {profile.phone && (
                    <p className="text-xs text-slate-600">Telp: {profile.phone}</p>
                  )}
                </div>
              </div>

              <div className="text-right">
                <h2 className="text-lg font-black tracking-wider text-slate-900">
                  {title}
                </h2>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">
                  {subtitle}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Dicetak pada:{' '}
                  {new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            {/* 1. Laporan Laba Rugi */}
            {reportType === 'income_statement' && pnlReport && (
              <div className="space-y-4">
                {pnlReport.sections.map((sec) => (
                  <div key={sec.key} className="space-y-1 break-inside-avoid">
                    <div className="flex justify-between font-bold text-xs bg-slate-100 px-3 py-1.5 uppercase border-b border-slate-300">
                      <span>{sec.label}</span>
                      <span>{formatIDR(sec.total)}</span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {sec.rows.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-100">
                            <td className="py-1 px-3 text-slate-500 font-mono w-24">
                              {row.code || '-'}
                            </td>
                            <td className="py-1 px-3 text-slate-800">
                              <span className={row.is_estimate ? 'italic' : ''}>
                                {row.name}
                              </span>
                            </td>
                            <td className="py-1 px-3 text-right font-mono font-medium text-slate-900 w-36">
                              {renderAmount(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                <div className="border-t-2 border-slate-900 pt-3 space-y-2 text-xs break-inside-avoid">
                  <div className="flex justify-between font-bold text-slate-800 px-3">
                    <span>LABA KOTOR:</span>
                    <span className="font-mono">
                      {formatIDR(pnlReport.totals.gross_profit)}
                      {pnlReport.totals.gross_margin_pct !== null && (
                        <span className="ml-2 font-normal text-slate-500">
                          ({pnlReport.totals.gross_margin_pct}%)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between font-black text-sm bg-slate-100 p-3 rounded">
                    <span>LABA BERSIH:</span>
                    <span className="font-mono">
                      {formatIDR(pnlReport.totals.net_profit)}
                      {pnlReport.totals.net_margin_pct !== null && (
                        <span className="ml-2 font-normal text-xs text-slate-600">
                          ({pnlReport.totals.net_margin_pct}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Laporan Neraca */}
            {reportType === 'balance_sheet' && bsReport && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  {/* Sisi Kiri: Aset */}
                  <div className="space-y-4">
                    <h3 className="font-bold text-xs uppercase border-b-2 border-slate-800 pb-1">
                      ASET (AKTIVA)
                    </h3>
                    {bsReport.sections
                      .filter((s) => s.key === 'current_assets' || s.key === 'fixed_assets')
                      .map((sec) => (
                        <div key={sec.key} className="space-y-1 break-inside-avoid">
                          <div className="flex justify-between font-bold text-xs bg-slate-100 px-2 py-1">
                            <span>{sec.label}</span>
                            <span>{formatIDR(sec.total)}</span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {sec.rows.map((row, idx) => (
                                <tr key={idx} className="border-b border-slate-100">
                                  <td className="py-1 px-2 text-slate-800">
                                    {row.code ? `${row.code} - ` : ''}
                                    {row.name}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono font-medium text-slate-900">
                                    {renderAmount(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <div className="flex justify-between font-black text-xs bg-slate-200 p-2 border-t-2 border-slate-800 break-inside-avoid">
                      <span>TOTAL ASET</span>
                      <span className="font-mono">
                        {formatIDR(bsReport.totals.total_assets)}
                      </span>
                    </div>
                  </div>

                  {/* Sisi Kanan: Liabilitas & Ekuitas */}
                  <div className="space-y-4">
                    <h3 className="font-bold text-xs uppercase border-b-2 border-slate-800 pb-1">
                      LIABILITAS & EKUITAS (PASIVA)
                    </h3>
                    {bsReport.sections
                      .filter((s) => s.key === 'liabilities' || s.key === 'equity')
                      .map((sec) => (
                        <div key={sec.key} className="space-y-1 break-inside-avoid">
                          <div className="flex justify-between font-bold text-xs bg-slate-100 px-2 py-1">
                            <span>{sec.label}</span>
                            <span>{formatIDR(sec.total)}</span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {sec.rows.map((row, idx) => (
                                <tr key={idx} className="border-b border-slate-100">
                                  <td className="py-1 px-2 text-slate-800">
                                    {row.code ? `${row.code} - ` : ''}
                                    {row.name}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono font-medium text-slate-900">
                                    {renderAmount(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <div className="flex justify-between font-black text-xs bg-slate-200 p-2 border-t-2 border-slate-800 break-inside-avoid">
                      <span>TOTAL LIABILITAS & EKUITAS</span>
                      <span className="font-mono">
                        {formatIDR(bsReport.totals.total_liabilities_and_equity)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Laporan Arus Kas */}
            {reportType === 'cash_flow' && cfReport && (
              <div className="space-y-4">
                <table className="w-full text-xs border border-slate-300">
                  <thead className="bg-slate-100 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-2 text-left">Aktivitas Arus Kas</th>
                      <th className="p-2 text-right">Jumlah (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cfReport.sections.map((sec) => (
                      <React.Fragment key={sec.key}>
                        <tr className="bg-slate-50 font-bold text-slate-800">
                          <td colSpan={2} className="p-2 uppercase">{sec.label}</td>
                        </tr>
                        {sec.rows.map((row) => (
                          <tr key={row.key}>
                            <td className="p-2 pl-4 text-slate-700">{row.name}</td>
                            <td className="p-2 text-right font-mono">{renderAmount(row.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-semibold border-b">
                          <td className="p-2 pl-4 font-bold">Total Arus Kas {sec.label}</td>
                          <td className="p-2 text-right font-mono font-bold">{renderAmount(sec.total)}</td>
                        </tr>
                      </React.Fragment>
                    ))}
                    <tr className="bg-slate-200 font-black">
                      <td className="p-2">Kenaikan (Penurunan) Bersih Kas & Bank</td>
                      <td className="p-2 text-right font-mono">{renderAmount(cfReport.totals.net_change)}</td>
                    </tr>
                    <tr>
                      <td className="p-2 pl-4 text-slate-600">Kas Awal Periode</td>
                      <td className="p-2 text-right font-mono">{renderAmount(cfReport.totals.opening_cash)}</td>
                    </tr>
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-800">
                      <td className="p-2 pl-4">Kas Akhir Periode</td>
                      <td className="p-2 text-right font-mono">{renderAmount(cfReport.totals.closing_cash)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. Laporan Perubahan Ekuitas */}
            {reportType === 'equity_changes' && eqReport && (
              <div className="space-y-4">
                <table className="w-full text-xs border border-slate-300">
                  <thead className="bg-slate-100 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-2 text-left">Komponen Ekuitas</th>
                      <th className="p-2 text-right">Jumlah (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {eqReport.rows.map((row) => (
                      <tr key={row.key} className={row.key === 'closing_equity' ? 'bg-slate-100 font-black border-t-2 border-slate-800' : ''}>
                        <td className="p-2 text-slate-800">{row.label}</td>
                        <td className="p-2 text-right font-mono font-medium">{renderAmount(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. Catatan Atas Laporan Keuangan */}
            {reportType === 'notes' && notesReport && (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <h4 className="font-bold text-xs uppercase bg-slate-100 p-2 border-b">1. Kas dan Setara Kas</h4>
                  <ul className="divide-y divide-slate-100">
                    {notesReport.cash_and_banks.rows.map((r) => (
                      <li key={r.account_id} className="py-1 px-2 flex justify-between">
                        <span>[{r.code}] {r.name}</span>
                        <span className="font-mono">{renderAmount(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between font-bold pt-1 px-2 border-t">
                    <span>Total Kas & Bank:</span>
                    <span className="font-mono">{renderAmount(notesReport.cash_and_banks.total)}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-xs uppercase bg-slate-100 p-2 border-b">2. Aset Tetap</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b font-semibold text-slate-600">
                        <th className="p-1 text-left">Kelas Aset</th>
                        <th className="p-1 text-right">Harga Perolehan</th>
                        <th className="p-1 text-right">Akumulasi Penyusutan</th>
                        <th className="p-1 text-right">Nilai Buku</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notesReport.fixed_assets.rows.map((fa) => (
                        <tr key={fa.asset_class} className="border-b border-slate-100">
                          <td className="p-1">{fa.label} ({fa.count} unit)</td>
                          <td className="p-1 text-right font-mono">{renderAmount(fa.cost)}</td>
                          <td className="p-1 text-right font-mono text-red-600">{renderAmount(-fa.accumulated)}</td>
                          <td className="p-1 text-right font-mono font-bold">{renderAmount(fa.book_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Kolom Tanda Tangan */}
            <div className="pt-8 border-t border-slate-300 grid grid-cols-2 text-center text-xs break-inside-avoid">
              <div>
                <p className="font-semibold text-slate-700">Dibuat oleh,</p>
                <div className="h-20 flex items-center justify-center">
                  {profile.signatureUrl && (
                    <img
                      src={profile.signatureUrl}
                      alt="Tanda tangan"
                      className="h-16 object-contain"
                    />
                  )}
                </div>
                <p className="font-bold text-slate-900 border-t border-slate-400 inline-block px-8 pt-1">
                  Bagian Keuangan / Akuntansi
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-700">Disetujui oleh,</p>
                <div className="h-20 flex items-center justify-center relative">
                  {profile.stampUrl && (
                    <img
                      src={profile.stampUrl}
                      alt="Stempel"
                      className="h-16 object-contain opacity-80"
                    />
                  )}
                </div>
                <p className="font-bold text-slate-900 border-t border-slate-400 inline-block px-8 pt-1">
                  Pimpinan / Direktur
                </p>
              </div>
            </div>

            {/* Footer Resmi Sistem */}
            <div className="mt-8 pt-3 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 break-inside-avoid print:break-inside-avoid">
              <p>
                Laporan dibuat oleh sistem SIKon | Manajemen Pesanan & Keuangan
              </p>
              <p className="font-mono text-slate-600">
                Waktu Cetak: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
