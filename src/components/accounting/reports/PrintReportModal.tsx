import React from 'react';
import { X, Printer, Building2 } from 'lucide-react';
import Button from '../../ui/button';
import { formatIDR } from '../../../utils/formatCurrency';
import { useCompanySettings } from '../../../hooks/useCompanySettings';
import type { IncomeStatementReport, BalanceSheetReport } from '../../../types';

interface PrintReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'income_statement' | 'balance_sheet';
  pnlReport: IncomeStatementReport | null;
  bsReport: BalanceSheetReport | null;
}

export default function PrintReportModal({
  isOpen,
  onClose,
  reportType,
  pnlReport,
  bsReport,
}: PrintReportModalProps) {
  const { profile } = useCompanySettings();

  if (!isOpen) return null;

  function handlePrint() {
    window.print();
  }

  const isPnL = reportType === 'income_statement';
  const title = isPnL ? 'LAPORAN LABA RUGI' : 'NERACA KEUANGAN';
  const subtitle = isPnL
    ? `Periode: ${pnlReport?.meta.from || '-'} s/d ${pnlReport?.meta.to || '-'}`
    : `Per Tanggal: ${bsReport?.meta.as_of || '-'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900">
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
              className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
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

        {/* Print Content Area */}
        <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
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

            {/* Tabel Laba Rugi */}
            {isPnL && pnlReport && (
              <div className="space-y-4">
                {pnlReport.sections.map((sec) => (
                  <div key={sec.key} className="space-y-1">
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
                              {row.amount < 0
                                ? `(${formatIDR(Math.abs(row.amount))})`
                                : formatIDR(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Ringkasan Total Laba */}
                <div className="border-t-2 border-slate-900 pt-3 space-y-2 text-xs">
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

            {/* Tabel Neraca */}
            {!isPnL && bsReport && (
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
                        <div key={sec.key} className="space-y-1">
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
                                    {row.amount < 0
                                      ? `(${formatIDR(Math.abs(row.amount))})`
                                      : formatIDR(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <div className="flex justify-between font-black text-xs bg-slate-200 p-2 border-t-2 border-slate-800">
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
                        <div key={sec.key} className="space-y-1">
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
                                    {row.amount < 0
                                      ? `(${formatIDR(Math.abs(row.amount))})`
                                      : formatIDR(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <div className="flex justify-between font-black text-xs bg-slate-200 p-2 border-t-2 border-slate-800">
                      <span>TOTAL LIABILITAS & EKUITAS</span>
                      <span className="font-mono">
                        {formatIDR(bsReport.totals.total_liabilities_and_equity)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kolom Tanda Tangan */}
            <div className="pt-10 border-t border-slate-300 grid grid-cols-2 text-center text-xs">
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
          </div>
        </div>
      </div>
    </div>
  );
}
