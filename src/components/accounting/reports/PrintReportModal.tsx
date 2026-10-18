import React from 'react';
import { X, Printer, Building2 } from 'lucide-react';
import DocumentPreviewModal from '../../documents/DocumentPreviewModal';
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
    <DocumentPreviewModal isOpen={isOpen} onClose={onClose} title="Pratinjau Laporan Keuangan" documentType={title} documentNo={asOfDate || 'Laporan'}>
      {(printMode) => (
          <div className="accounting-report document-template space-y-6">
            {/* Kop Surat Perusahaan */}
            <div className="document-letterhead flex items-start justify-between border-b-2 border-border pb-4">
              <div className="flex items-center gap-4">
                {profile.logoUrl ? (
                  <img
                    src={profile.logoUrl}
                    alt="Logo"
                    className="h-16 w-16 object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold tracking-normal text-foreground uppercase">
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
                <h2 className="text-lg font-black tracking-wider text-foreground">
                  {title}
                </h2>
                <p className="text-xs font-semibold text-foreground mt-0.5">
                  {subtitle}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
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
                    <div className="flex justify-between font-bold text-xs bg-muted px-3 py-1.5 uppercase border-b border-border">
                      <span>{sec.label}</span>
                      <span>{formatIDR(sec.total)}</span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {sec.rows.map((row, idx) => (
                          <tr key={idx} className="border-b border-border">
                            <td className="py-1 px-3 text-muted-foreground font-mono w-24">
                              {row.code || '-'}
                            </td>
                            <td className="py-1 px-3 text-foreground">
                              <span className={row.is_estimate ? 'italic' : ''}>
                                {row.name}
                              </span>
                            </td>
                            <td className="py-1 px-3 text-right font-mono font-medium text-foreground w-36">
                              {renderAmount(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                <div className="border-t-2 border-border pt-3 space-y-2 text-xs break-inside-avoid">
                  <div className="flex justify-between font-bold text-foreground px-3">
                    <span>LABA KOTOR:</span>
                    <span className="font-mono">
                      {formatIDR(pnlReport.totals.gross_profit)}
                      {pnlReport.totals.gross_margin_pct !== null && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({pnlReport.totals.gross_margin_pct}%)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between font-black text-sm bg-muted p-3 rounded">
                    <span>LABA BERSIH:</span>
                    <span className="font-mono">
                      {formatIDR(pnlReport.totals.net_profit)}
                      {pnlReport.totals.net_margin_pct !== null && (
                        <span className="ml-2 font-normal text-xs text-muted-foreground">
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
                    <h3 className="font-bold text-xs uppercase border-b-2 border-border pb-1">
                      ASET (AKTIVA)
                    </h3>
                    {bsReport.sections
                      .filter((s) => s.key === 'current_assets' || s.key === 'fixed_assets')
                      .map((sec) => (
                        <div key={sec.key} className="space-y-1 break-inside-avoid">
                          <div className="flex justify-between font-bold text-xs bg-muted px-2 py-1">
                            <span>{sec.label}</span>
                            <span>{formatIDR(sec.total)}</span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {sec.rows.map((row, idx) => (
                                <tr key={idx} className="border-b border-border">
                                  <td className="py-1 px-2 text-foreground">
                                    {row.code ? `${row.code} - ` : ''}
                                    {row.name}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono font-medium text-foreground">
                                    {renderAmount(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <div className="flex justify-between font-black text-xs bg-muted p-2 border-t-2 border-border break-inside-avoid">
                      <span>TOTAL ASET</span>
                      <span className="font-mono">
                        {formatIDR(bsReport.totals.total_assets)}
                      </span>
                    </div>
                  </div>

                  {/* Sisi Kanan: Liabilitas & Ekuitas */}
                  <div className="space-y-4">
                    <h3 className="font-bold text-xs uppercase border-b-2 border-border pb-1">
                      LIABILITAS & EKUITAS (PASIVA)
                    </h3>
                    {bsReport.sections
                      .filter((s) => s.key === 'liabilities' || s.key === 'equity')
                      .map((sec) => (
                        <div key={sec.key} className="space-y-1 break-inside-avoid">
                          <div className="flex justify-between font-bold text-xs bg-muted px-2 py-1">
                            <span>{sec.label}</span>
                            <span>{formatIDR(sec.total)}</span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {sec.rows.map((row, idx) => (
                                <tr key={idx} className="border-b border-border">
                                  <td className="py-1 px-2 text-foreground">
                                    {row.code ? `${row.code} - ` : ''}
                                    {row.name}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono font-medium text-foreground">
                                    {renderAmount(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <div className="flex justify-between font-black text-xs bg-muted p-2 border-t-2 border-border break-inside-avoid">
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
                <table className="w-full text-xs border border-border">
                  <thead className="bg-muted font-bold border-b border-border">
                    <tr>
                      <th className="p-2 text-left">Aktivitas Arus Kas</th>
                      <th className="p-2 text-right">Jumlah (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cfReport.sections.map((sec) => (
                      <React.Fragment key={sec.key}>
                        <tr className="bg-muted font-bold text-foreground">
                          <td colSpan={2} className="p-2 uppercase">{sec.label}</td>
                        </tr>
                        {sec.rows.map((row) => (
                          <tr key={row.key}>
                            <td className="p-2 pl-4 text-foreground">{row.name}</td>
                            <td className="p-2 text-right font-mono">{renderAmount(row.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted font-semibold border-b">
                          <td className="p-2 pl-4 font-bold">Total Arus Kas {sec.label}</td>
                          <td className="p-2 text-right font-mono font-bold">{renderAmount(sec.total)}</td>
                        </tr>
                      </React.Fragment>
                    ))}
                    <tr className="bg-muted font-black">
                      <td className="p-2">Kenaikan (Penurunan) Bersih Kas & Bank</td>
                      <td className="p-2 text-right font-mono">{renderAmount(cfReport.totals.net_change)}</td>
                    </tr>
                    <tr>
                      <td className="p-2 pl-4 text-muted-foreground">Kas Awal Periode</td>
                      <td className="p-2 text-right font-mono">{renderAmount(cfReport.totals.opening_cash)}</td>
                    </tr>
                    <tr className="bg-muted font-black border-t-2 border-border">
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
                <table className="w-full text-xs border border-border">
                  <thead className="bg-muted font-bold border-b border-border">
                    <tr>
                      <th className="p-2 text-left">Komponen Ekuitas</th>
                      <th className="p-2 text-right">Jumlah (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {eqReport.rows.map((row) => (
                      <tr key={row.key} className={row.key === 'closing_equity' ? 'bg-muted font-black border-t-2 border-border' : ''}>
                        <td className="p-2 text-foreground">{row.label}</td>
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
                  <h4 className="font-bold text-xs uppercase bg-muted p-2 border-b">1. Kas dan Setara Kas</h4>
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
                  <h4 className="font-bold text-xs uppercase bg-muted p-2 border-b">2. Aset Tetap</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b font-semibold text-muted-foreground">
                        <th className="p-1 text-left">Kelas Aset</th>
                        <th className="p-1 text-right">Harga Perolehan</th>
                        <th className="p-1 text-right">Akumulasi Penyusutan</th>
                        <th className="p-1 text-right">Nilai Buku</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notesReport.fixed_assets.rows.map((fa) => (
                        <tr key={fa.asset_class} className="border-b border-border">
                          <td className="p-1">{fa.label} ({fa.count} unit)</td>
                          <td className="p-1 text-right font-mono">{renderAmount(fa.cost)}</td>
                          <td className="p-1 text-right font-mono text-destructive">{renderAmount(-fa.accumulated)}</td>
                          <td className="p-1 text-right font-mono font-bold">{renderAmount(fa.book_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Kolom Tanda Tangan */}
            <div className="signature-area pt-8 border-t border-border grid grid-cols-2 text-center text-xs break-inside-avoid">
              <div>
                <p className="font-semibold text-foreground">Dibuat oleh,</p>
                <div className="h-20 flex items-center justify-center">
                  {printMode !== 'none' && profile.signatureUrl && (
                    <img
                      src={profile.signatureUrl}
                      alt="Tanda tangan"
                      className="h-16 object-contain"
                    />
                  )}
                </div>
                <p className="font-bold text-foreground border-t border-border inline-block px-8 pt-1">
                  Bagian Keuangan / Akuntansi
                </p>
              </div>

              <div>
                <p className="font-semibold text-foreground">Disetujui oleh,</p>
                <div className="h-20 flex items-center justify-center relative">
                  {printMode === 'signature_and_stamp' && profile.stampUrl && (
                    <img
                      src={profile.stampUrl}
                      alt="Stempel"
                      className="h-16 object-contain opacity-80"
                    />
                  )}
                </div>
                <p className="font-bold text-foreground border-t border-border inline-block px-8 pt-1">
                  Pimpinan / Direktur
                </p>
              </div>
            </div>

          </div>
      )}
    </DocumentPreviewModal>
  );
}
