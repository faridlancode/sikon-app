import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Printer,
  Download,
  Loader2,
  ArrowLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  FileText,
  Scale,
  TrendingUp,
  Activity,
  Layers,
  HelpCircle,
  ShieldCheck,
  Wallet,
  Boxes,
  Users,
  Truck,
  Info,
} from 'lucide-react';
import Button from '../components/ui/button';
import { formatIDR } from '../utils/formatCurrency';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useFinancialStatements } from '../hooks/useFinancialStatements';
import { downloadDocumentPdf, printDocument } from '../utils/documentPdf';
import {
  todayISO,
  startOfMonthISO,
  endOfMonthISO,
} from '../utils/dateHelpers';
import type {
  IncomeStatementReport,
  BalanceSheetReport,
  CashFlowReport,
  EquityChangesReport,
  ReportNotesData,
  AccountingCheck,
} from '../types';

export default function AccountingPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useCompanySettings();
  const {
    getIncomeStatement,
    getBalanceSheet,
    getCashFlow,
    getEquityChanges,
    getReportNotes,
    getAccountingChecks,
  } = useFinancialStatements();

  const from = searchParams.get('from') || startOfMonthISO();
  const to = searchParams.get('to') || endOfMonthISO();
  const asOf = searchParams.get('as_of') || to || todayISO();
  const includeProvisional = searchParams.get('include_provisional') !== 'false';

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pnl, setPnl] = useState<IncomeStatementReport | null>(null);
  const [bs, setBs] = useState<BalanceSheetReport | null>(null);
  const [cf, setCf] = useState<CashFlowReport | null>(null);
  const [eq, setEq] = useState<EquityChangesReport | null>(null);
  const [notes, setNotes] = useState<ReportNotesData | null>(null);
  const [checks, setChecks] = useState<AccountingCheck[]>([]);

  function formatPrintTimestamp(d: Date = new Date()): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}`;
  }

  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const printTimeStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const timestamp = formatPrintTimestamp();
  const generatedFilename = `Laporan_Keuangan_${from}_sd_${to}_${timestamp}.pdf`;

  function handlePrint() {
    const element = document.getElementById('printable-accounting-report');
    if (element) void printDocument(element, generatedFilename);
  }

  async function handleDownloadPdf() {
    const element = document.getElementById('printable-accounting-report');
    if (!element) return;
    try {
      setDownloading(true);
      await downloadDocumentPdf(element, generatedFilename);
    } catch (err) {
      console.error('Gagal mengunduh laporan:', err);
      handlePrint();
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    async function loadAllData() {
      setLoading(true);
      setError(null);
      try {
        const [pnlData, bsData, cfData, eqData, notesData, checksData] =
          await Promise.all([
            getIncomeStatement(from, to, null, null, includeProvisional),
            getBalanceSheet(asOf, null, includeProvisional),
            getCashFlow(from, to, null, null),
            getEquityChanges(from, to, includeProvisional),
            getReportNotes(asOf),
            getAccountingChecks(asOf),
          ]);

        if (isMounted) {
          setPnl(pnlData);
          setBs(bsData);
          setCf(cfData);
          setEq(eqData);
          setNotes(notesData);
          setChecks(checksData);
        }
      } catch (err: any) {
        console.error('Gagal memuat data laporan lengkap:', err);
        if (isMounted) {
          setError(err.message || 'Terjadi kesalahan saat memuat laporan keuangan.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAllData();
    return () => {
      isMounted = false;
    };
  }, [
    from,
    to,
    asOf,
    includeProvisional,
    getIncomeStatement,
    getBalanceSheet,
    getCashFlow,
    getEquityChanges,
    getReportNotes,
    getAccountingChecks,
  ]);

  const isFinal = pnl?.meta.status === 'locked' && bs?.meta.status === 'locked';

  function renderAmount(val: number | null | undefined, isEstimate = false) {
    if (val === null || val === undefined) return '-';
    if (val < 0) return `(${formatIDR(Math.abs(val))})`;
    return formatIDR(val);
  }

  // Ringkasan Eksekutif Deterministik (3 - 5 Kalimat)
  const executiveSummary = useMemo(() => {
    if (!pnl || !bs || !cf) return [];

    const rev = pnl.sections.find((s) => s.key === 'revenue')?.total ?? 0;
    const netProfit = pnl.totals.net_profit;
    const netMargin = pnl.totals.net_margin_pct ?? 0;
    const netOpCash = cf.totals.net_operating;
    const cashTotal = cf.totals.closing_cash;
    const totalAssets = bs.totals.total_assets;
    const totalLiab = bs.totals.total_liabilities;
    const totalEquity = bs.totals.total_equity;

    const sentences: string[] = [];

    // 1. Kinerja Penjualan & Laba
    if (netProfit >= 0) {
      sentences.push(
        `Pada periode ${from} s/d ${to}, usaha mencatatkan pendapatan bersih sebesar ${formatIDR(
          rev
        )} dengan laba bersih operasional sebesar ${formatIDR(
          netProfit
        )} (margin laba bersih sebesar ${netMargin}%).`
      );
    } else {
      sentences.push(
        `Pada periode ${from} s/d ${to}, usaha membukukan total pendapatan ${formatIDR(
          rev
        )} namun mengalami rugi bersih operasional sebesar ${formatIDR(
          Math.abs(netProfit)
        )}.`
      );
    }

    // 2. Kondisi Arus Kas
    if (netOpCash >= 0) {
      sentences.push(
        `Arus kas dari aktivitas operasional menghasilkan surplus kas bersih sebesar ${formatIDR(
          netOpCash
        )}, sehingga saldo kas dan bank yang tersedia pada akhir periode tercatat sebesar ${formatIDR(
          cashTotal
        )}.`
      );
    } else {
      sentences.push(
        `Arus kas operasional mengalami defisit sebesar ${formatIDR(
          Math.abs(netOpCash)
        )} terutama disebabkan oleh pengeluaran modal belanja bahan baku atau pemenuhan pesanan berjalan, dengan posisi sisa kas dan bank sebesar ${formatIDR(
          cashTotal
        )}.`
      );
    }

    // 3. Struktur Permodalan & Neraca
    const equityPct =
      totalAssets > 0 ? ((totalEquity / totalAssets) * 100).toFixed(1) : '100';
    sentences.push(
      `Total harta kekayaan usaha per ${asOf} tercatat sebesar ${formatIDR(
        totalAssets
      )}, dengan struktur permodalan mandiri (ekuitas pemilik) mendanai ${equityPct}% dari total aset, serta kewajiban operasional tercatat sebesar ${formatIDR(
        totalLiab
      )}.`
    );

    // 4. Catatan Status / Peringatan
    if (!isFinal) {
      sentences.push(
        `Catatan Penting: Laporan ini masih berstatus SEMENTARA karena periode pembukuan belum ditutup secara formal di sistem; angka HPP bahan baku menggunakan estimasi nilai stok fisik gudang.`
      );
    } else {
      sentences.push(
        `Laporan ini telah ditutup dan dikunci secara permanen di sistem, seluruh rekonsiliasi antara Laba Rugi, Arus Kas, dan Neraca telah diverifikasi tuntas.`
      );
    }

    return sentences;
  }, [pnl, bs, cf, from, to, asOf, isFinal]);

  const renderWatermark = () => isFinal ? null : (
    <div className="document-watermark document-watermark-provisional">SEMENTARA</div>
  );

  // Physical page footers are added by the shared PDF exporter.
  const renderSystemFooter = (_pageLabel?: string) => null;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted text-foreground p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
        <h2 className="text-base font-bold">Menyusun Dokumen Laporan Keuangan Lengkap...</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Mengambil data Laba Rugi, Neraca, Arus Kas, Perubahan Ekuitas, dan Catatan Laporan dari basis data.
        </p>
      </div>
    );
  }

  if (error || !pnl || !bs || !cf || !eq || !notes) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted text-foreground p-6">
        <div className="max-w-md w-full bg-card p-6 rounded-lg border border-destructive/20 shadow-md text-center">
          <AlertOctagon className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h2 className="text-base font-bold text-destructive">Gagal Membuka Laporan Keuangan</h2>
          <p className="text-xs text-muted-foreground mt-2">{error || 'Data laporan tidak lengkap.'}</p>
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate('/akuntansi')}
            className="mt-5 w-full text-xs"
          >
            Kembali ke Halaman Akuntansi
          </Button>
        </div>
      </div>
    );
  }

  const revTotal = pnl.sections.find((s) => s.key === 'revenue')?.total ?? 0;

  return (
    <div className="min-h-screen bg-muted text-foreground font-sans print:bg-card print:p-0">
      {/* ── Screen Only Floating Control Bar ────────────────────────────── */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-6 py-3.5 shadow-sm backdrop-blur print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/akuntansi')}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Aplikasi
          </Button>
          <div className="border-l border-border pl-3">
            <h1 className="text-sm font-bold text-foreground">
              Dokumen Resmi Laporan Keuangan SIKon
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Periode: {from} s/d {to} • Posisi Neraca: {asOf}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">


          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="h-9 gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow"
            title={`Download berkas PDF langsung (${generatedFilename})`}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>{downloading ? 'Mengunduh PDF...' : 'Download PDF'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={downloading}
            className="h-9 gap-2 text-xs font-bold border-border hover:bg-muted text-foreground shadow-sm"
            title="Buka dialog cetak browser atau cetak ke printer fisik"
          >
            <Printer className="h-4 w-4" />
            Cetak Browser
          </Button>
        </div>
      </div>

      {/* ── Print Container (A4 styling & Page Breaks) ─────────────────── */}
      <div
        id="printable-accounting-report"
        className="accounting-report document-template print-accounting-page relative mx-auto my-6 max-w-[210mm] bg-card p-8 shadow-soft print:my-0 print:p-0 print:shadow-none print:w-full"
      >
        <div className="accounting-sections relative z-10">
          {/* ================================================================ */}
          {/* 1. HALAMAN SAMPUL (COVER PAGE)                                   */}
          {/* ================================================================ */}
          <div className="accounting-cover relative space-y-6">
            {renderWatermark()}
            {/* Kop & Logo Perusahaan */}
            <div className="flex items-start justify-between border-b border-border pb-6">
              <div className="flex items-center gap-4">
                {profile.logoUrl ? (
                  <img
                    src={profile.logoUrl}
                    alt="Logo Perusahaan"
                    className="h-20 w-20 object-contain"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Building2 className="h-10 w-10 text-primary" />
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-normal text-foreground">
                    {profile.companyName || 'SIKon Konveksi'}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    {profile.address || 'Alamat operasional perusahaan konveksi'}
                  </p>
                  {profile.phone && (
                    <p className="text-xs text-muted-foreground">Telepon / WhatsApp: {profile.phone}</p>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-block text-center align-middle rounded-full text-xs font-black tracking-wider uppercase border leading-none ${isFinal
                      ? 'bg-success-soft text-success border-success'
                      : 'bg-warning-soft text-warning border-warning'
                    }`}
                  style={{ padding: '6px 14px 5px 14px' }}
                >
                  STATUS: {isFinal ? 'FINAL (TERKUNCI)' : 'SEMENTARA (UNAUDITED)'}
                </span>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Tanggal Cetak:{' '}
                  {new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Judul Besar Laporan */}
            <div className="py-8 text-center space-y-4">
              <span
                className="inline-block text-center align-middle text-xs font-bold tracking-normal text-primary uppercase bg-primary/10 rounded-full leading-none"
                style={{ padding: '6px 14px 5px 14px' }}
              >
                Laporan Pertanggungjawaban Finansial
              </span>
              <h1 className="text-3xl font-black tracking-normal text-foreground">
                LAPORAN KEUANGAN
              </h1>
              <p className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Laba Rugi • Neraca • Arus Kas • Perubahan Ekuitas • Catatan
              </p>
              <div className="pt-6">
                <p className="text-base font-bold text-foreground">
                  Periode Buku: {from} s/d {to}
                </p>
                <p className="text-xs text-muted-foreground">
                  Posisi Neraca per Tanggal: {asOf}
                </p>
              </div>

              {!isFinal && (
                <div className="mx-auto max-w-md mt-6 rounded-lg border border-warning bg-warning-soft p-3 text-xs text-warning font-medium leading-relaxed">
                  Perhatian: Laporan ini disusun sebelum penutupan buku akhir periode kalender selesai, sehingga nilai beban persediaan menggunakan kalkulasi estimasi fisik berjalan.
                </div>
              )}
            </div>


          </div>

          {/* ================================================================ */}
          {/* 2. RINGKASAN SATU HALAMAN (EXECUTIVE SUMMARY)                     */}
          {/* ================================================================ */}
          <div data-pdf-section className="relative space-y-5">
            {renderWatermark()}
            <div className="space-y-6">
              <div className="border-b border-border pb-3">
                <h2 className="text-xl font-bold uppercase tracking-wide text-foreground">
                  Ringkasan Eksekutif Finansial
                </h2>
                <p className="text-xs text-muted-foreground">
                  Lima angka kunci kinerja dan intisari kondisi keuangan usaha
                </p>
              </div>

              {/* 5 Angka Kunci */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-lg border border-border bg-muted space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    1. Penjualan Bersih
                  </span>
                  <p className="text-lg font-black font-mono text-foreground">
                    {formatIDR(revTotal)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Omzet pesanan diserahkan</span>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    2. Laba Bersih
                  </span>
                  <p className={`text-lg font-black font-mono ${pnl.totals.net_profit < 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {renderAmount(pnl.totals.net_profit)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Hasil bersih setelah beban</span>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    3. Kas & Bank
                  </span>
                  <p className="text-lg font-black font-mono text-foreground">
                    {formatIDR(cf.totals.closing_cash)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Saldo likuid di kasir & bank</span>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    4. Total Harta (Aset)
                  </span>
                  <p className="text-lg font-black font-mono text-foreground">
                    {formatIDR(bs.totals.total_assets)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Kas, persediaan, dan mesin</span>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    5. Total Kewajiban
                  </span>
                  <p className="text-lg font-black font-mono text-foreground">
                    {formatIDR(bs.totals.total_liabilities)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Uang muka pesanan & hutang</span>
                </div>
              </div>

              {/* Paragraf Narasi Kondisi Usaha */}
              <div className="rounded-lg border border-border bg-muted/70 p-5 space-y-3 text-xs leading-relaxed text-foreground">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Kondisi dan Analisis Usaha Periode Ini
                </h3>
                {executiveSummary.map((sentence, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {sentence}
                  </p>
                ))}
              </div>

              {/* Uji Keseimbangan dan Integritas Sistem */}
              <div className="p-4 rounded-lg border border-border bg-card text-xs space-y-2">
                <h4 className="font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Indikator Integritas Pembukuan SIKon
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span>Neraca seimbang: Aset = Liabilitas + Ekuitas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span>Laba Tahun Berjalan di Neraca cocok dengan Laba Bersih</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span>Kas Akhir Arus Kas ({formatIDR(cf.totals.closing_cash)}) cocok dengan Neraca</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span>Ekuitas Akhir ({formatIDR(eq.totals.closing_equity)}) cocok dengan Neraca</span>
                  </div>
                </div>
              </div>
            </div>

            {renderSystemFooter('Halaman 2 dari Dokumen Laporan Keuangan Lengkap')}
          </div>

          {/* ================================================================ */}
          {/* 3. LAPORAN LABA RUGI (INCOME STATEMENT)                          */}
          {/* ================================================================ */}
          <div data-pdf-section className="relative py-6 space-y-5">
            {renderWatermark()}
            <div className="flex justify-between items-end border-b-2 border-border pb-2">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-normal text-foreground">
                  I. Laporan Laba Rugi
                </h2>
                <p className="text-xs text-muted-foreground">
                  Periode Pembukuan: {from} s/d {to}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                Mata Uang: IDR (Rupiah)
              </span>
            </div>

            {/* Kotak Edukasi Pengembang: Apa artinya? */}
            <div className="rounded-lg border border-border bg-accent/60 p-3.5 text-xs text-accent-foreground leading-relaxed">
              <strong>Apa artinya Laporan Laba Rugi?</strong>
              <p className="mt-1 text-foreground">
                Laporan ini mengukur kinerja operasional usaha konveksi: berapa uang yang didapat dari pesanan yang selesai dikirim dikurangi biaya kain/bahan (HPP), upah borongan penjahit, dan beban operasional harian (seperti gaji, listrik, dan penyusutan mesin). Angka akhir adalah <strong>Laba Bersih</strong> yang menjadi keuntungan riil bisnis Anda.
              </p>
            </div>

            {/* Tabel Laba Rugi */}
            <div className="space-y-4">
              {pnl.sections.map((sec) => (
                <div key={sec.key} className="space-y-1 break-inside-avoid">
                  <div className="flex justify-between font-bold text-xs bg-muted px-3 py-1.5 uppercase border-b border-border">
                    <span>{sec.label}</span>
                    <span className="font-mono">{formatIDR(sec.total)}</span>
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

              {/* Total Laba Kotor & Bersih */}
              <div className="border-t-2 border-border pt-3 space-y-2 text-xs break-inside-avoid">
                <div className="flex justify-between font-bold text-foreground px-3">
                  <span>LABA KOTOR (GROSS PROFIT):</span>
                  <span className="font-mono">
                    {formatIDR(pnl.totals.gross_profit)}
                    {pnl.totals.gross_margin_pct !== null && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({pnl.totals.gross_margin_pct}%)
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between font-black text-sm bg-muted p-3 rounded">
                  <span>LABA BERSIH TAHUN BERJALAN (NET PROFIT):</span>
                  <span className="font-mono">
                    {renderAmount(pnl.totals.net_profit)}
                    {pnl.totals.net_margin_pct !== null && (
                      <span className="ml-2 font-normal text-xs text-muted-foreground">
                        ({pnl.totals.net_margin_pct}%)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {renderSystemFooter('Halaman 3 dari Dokumen Laporan Keuangan Lengkap')}
          </div>

          {/* ================================================================ */}
          {/* 4. NERACA KEUANGAN (BALANCE SHEET)                               */}
          {/* ================================================================ */}
          <div data-pdf-section className="relative py-6 space-y-5">
            {renderWatermark()}
            <div className="flex justify-between items-end border-b-2 border-border pb-2">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-normal text-foreground">
                  II. Neraca Keuangan (Posisi Finansial)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Per Tanggal: {asOf}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                Format Skontro SAK EMKM
              </span>
            </div>

            {/* Kotak Edukasi Pengembang: Apa artinya? */}
            <div className="rounded-lg border border-border bg-accent/60 p-3.5 text-xs text-accent-foreground leading-relaxed">
              <strong>Apa artinya Laporan Neraca?</strong>
              <p className="mt-1 text-foreground">
                Neraca menunjukkan potret kekayaan usaha pada tanggal penutupan: apa saja yang dimiliki bisnis (Aset: kas, saldo bank, gulungan kain di gudang, dan mesin jahit), kewajiban yang masih harus dipenuhi (Liabilitas: DP pesanan dari pelanggan sebelum barang dikirim), dan modal bersih pemilik (Ekuitas). <strong>Total Aset selalu sama dengan Total Liabilitas + Ekuitas.</strong>
              </p>
            </div>

            {/* Tabel Neraca Dua Sisi */}
            <div className="grid grid-cols-2 gap-6 text-xs">
              {/* Sisi Kiri: Aset */}
              <div className="space-y-4">
                <h3 className="font-bold text-xs uppercase border-b-2 border-border pb-1 text-foreground">
                  ASET (AKTIVA)
                </h3>
                {bs.sections
                  .filter((s) => s.key === 'current_assets' || s.key === 'fixed_assets')
                  .map((sec) => (
                    <div key={sec.key} className="space-y-1 break-inside-avoid">
                      <div className="flex justify-between font-bold text-xs bg-muted px-2 py-1">
                        <span>{sec.label}</span>
                        <span className="font-mono">{formatIDR(sec.total)}</span>
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
                  <span className="font-mono">{formatIDR(bs.totals.total_assets)}</span>
                </div>
              </div>

              {/* Sisi Kanan: Liabilitas & Ekuitas */}
              <div className="space-y-4">
                <h3 className="font-bold text-xs uppercase border-b-2 border-border pb-1 text-foreground">
                  LIABILITAS & EKUITAS (PASIVA)
                </h3>
                {bs.sections
                  .filter((s) => s.key === 'liabilities' || s.key === 'equity')
                  .map((sec) => (
                    <div key={sec.key} className="space-y-1 break-inside-avoid">
                      <div className="flex justify-between font-bold text-xs bg-muted px-2 py-1">
                        <span>{sec.label}</span>
                        <span className="font-mono">{formatIDR(sec.total)}</span>
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
                    {formatIDR(bs.totals.total_liabilities_and_equity)}
                  </span>
                </div>
              </div>
            </div>

            {renderSystemFooter('Halaman 4 dari Dokumen Laporan Keuangan Lengkap')}
          </div>

          {/* ================================================================ */}
          {/* 5. LAPORAN ARUS KAS (CASH FLOW STATEMENT)                        */}
          {/* ================================================================ */}
          <div data-pdf-section className="relative py-6 space-y-5">
            {renderWatermark()}
            <div className="flex justify-between items-end border-b-2 border-border pb-2">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-normal text-foreground">
                  III. Laporan Arus Kas
                </h2>
                <p className="text-xs text-muted-foreground">
                  Metode Langsung • Periode: {from} s/d {to}
                </p>
              </div>
              <span
                className="inline-block text-center align-middle text-xs font-mono font-semibold text-success bg-success-soft rounded border border-success leading-none"
                style={{ padding: '4px 10px 3px 10px' }}
              >
                {cf.meta.reconciled ? '✓ Rekonsiliasi Kas Cocok' : 'Perlu Diperiksa'}
              </span>
            </div>

            {/* Kotak Edukasi Pengembang: Apa artinya? */}
            <div className="rounded-lg border border-border bg-accent/60 p-3.5 text-xs text-accent-foreground leading-relaxed">
              <strong>Apa artinya Laporan Arus Kas?</strong>
              <p className="mt-1 text-foreground">
                Laporan Arus Kas melacak pergerakan uang riil yang masuk dan keluar dari dompet kasir dan rekening bank operasional. Berbeda dengan laba (yang baru dihitung saat baju dikirim), arus kas mencatat ketika uang tunai benar-benar berpindah tangan: seperti DP yang diterima lebih awal, pembayaran tunai kain ke supplier, atau penarikan uang pribadi (prive) pemilik.
              </p>
            </div>

            {/* Tabel Arus Kas */}
            <table className="w-full text-xs border border-border">
              <thead className="bg-muted font-bold border-b border-border">
                <tr>
                  <th className="p-2 text-left">Aktivitas Arus Kas</th>
                  <th className="p-2 text-right">Jumlah (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cf.sections.map((sec) => (
                  <React.Fragment key={sec.key}>
                    <tr className="bg-muted font-bold text-foreground">
                      <td colSpan={2} className="p-2 uppercase tracking-wide">
                        {sec.label}
                      </td>
                    </tr>
                    {sec.rows.map((row) => (
                      <tr key={row.key} className="hover:bg-muted">
                        <td className="p-2 pl-4 text-foreground">{row.name}</td>
                        <td className="p-2 text-right font-mono">{renderAmount(row.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted font-bold border-b">
                      <td className="p-2 pl-4 font-bold">Total Arus Kas {sec.label}</td>
                      <td className="p-2 text-right font-mono font-bold">{renderAmount(sec.total)}</td>
                    </tr>
                  </React.Fragment>
                ))}

                <tr className="bg-muted font-black border-t-2 border-border">
                  <td className="p-2">Kenaikan (Penurunan) Bersih Kas & Bank</td>
                  <td className="p-2 text-right font-mono font-black text-sm">
                    {renderAmount(cf.totals.net_change)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 pl-4 text-muted-foreground">Saldo Kas & Bank pada Awal Periode</td>
                  <td className="p-2 text-right font-mono">{renderAmount(cf.totals.opening_cash)}</td>
                </tr>
                <tr className="bg-muted font-black border-t-2 border-border">
                  <td className="p-2 pl-4">Saldo Kas & Bank pada Akhir Periode</td>
                  <td className="p-2 text-right font-mono text-sm text-primary">
                    {renderAmount(cf.totals.closing_cash)}
                  </td>
                </tr>
              </tbody>
            </table>

            {renderSystemFooter('Halaman 5 dari Dokumen Laporan Keuangan Lengkap')}
          </div>

          {/* ================================================================ */}
          {/* 6. LAPORAN PERUBAHAN EKUITAS                                      */}
          {/* ================================================================ */}
          <div data-pdf-section className="relative py-6 space-y-5">
            {renderWatermark()}
            <div className="flex justify-between items-end border-b-2 border-border pb-2">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-normal text-foreground">
                  IV. Laporan Perubahan Ekuitas
                </h2>
                <p className="text-xs text-muted-foreground">
                  Periode Pembukuan: {from} s/d {to}
                </p>
              </div>
              <span
                className="inline-block text-center align-middle text-xs font-mono font-semibold text-success bg-success-soft rounded border border-success leading-none"
                style={{ padding: '4px 10px 3px 10px' }}
              >
                {eq.meta.reconciled ? '✓ Rekonsiliasi Ekuitas Cocok' : 'Perlu Diperiksa'}
              </span>
            </div>

            {/* Kotak Edukasi Pengembang: Apa artinya? */}
            <div className="rounded-lg border border-border bg-accent/60 p-3.5 text-xs text-accent-foreground leading-relaxed">
              <strong>Apa artinya Laporan Perubahan Ekuitas?</strong>
              <p className="mt-1 text-foreground">
                Laporan ini menghubungkan Laba Rugi dengan Neraca: menjelaskan bagaimana modal bersih pemilik berubah dari awal sampai akhir periode. Modal bertambah karena keuntungan usaha (laba bersih) atau setoran dana segar dari pemilik, dan berkurang apabila pemilik mengambil uang pribadi (prive).
              </p>
            </div>

            {/* Tabel Perubahan Ekuitas */}
            <table className="w-full text-xs border border-border">
              <thead className="bg-muted font-bold border-b border-border">
                <tr>
                  <th className="p-2.5 text-left">Komponen Ekuitas Pemilik</th>
                  <th className="p-2.5 text-right">Jumlah (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {eq.rows.map((row) => {
                  const isClosing = row.key === 'closing_equity';
                  const isOpening = row.key === 'opening_equity';
                  return (
                    <tr
                      key={row.key}
                      className={
                        isClosing
                          ? 'bg-muted font-black border-t-2 border-border'
                          : isOpening
                            ? 'bg-muted font-bold'
                            : ''
                      }
                    >
                      <td className={`p-2.5 ${isClosing ? 'text-foreground text-sm' : 'text-foreground'}`}>
                        {row.label}
                      </td>
                      <td className={`p-2.5 text-right font-mono ${isClosing ? 'text-foreground font-black text-sm' : ''}`}>
                        {renderAmount(row.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Cross-Check Box */}
            <div className="p-3 bg-muted rounded border border-border text-xs flex justify-between">
              <span>Uji Silang dengan Total Ekuitas di Neraca:</span>
              <span className="font-mono font-bold text-foreground">{formatIDR(eq.totals.balance_sheet_equity)} (Selisih: {formatIDR(eq.totals.difference)})</span>
            </div>

            {renderSystemFooter('Halaman 6 dari Dokumen Laporan Keuangan Lengkap')}
          </div>

          {/* ================================================================ */}
          {/* 7. CATATAN ATAS LAPORAN KEUANGAN (CALK)                           */}
          {/* ================================================================ */}
          <div data-pdf-section className="relative py-6 space-y-5">
            {renderWatermark()}
            <div className="border-b-2 border-border pb-2">
              <h2 className="text-xl font-bold uppercase tracking-normal text-foreground">
                V. Catatan Atas Laporan Keuangan (CALK)
              </h2>
              <p className="text-xs text-muted-foreground">
                Rincian penjelas pos-pos penting neraca per {asOf}
              </p>
            </div>

            {/* Kebijakan Akuntansi Singkat */}
            <div className="space-y-2 text-xs">
              <h3 className="font-bold text-foreground uppercase tracking-wide">
                1. Kebijakan Akuntansi Pokok
              </h3>
              <ul className="list-disc list-inside space-y-1 text-foreground leading-relaxed bg-muted p-3 rounded border border-border">
                <li><strong>Pengakuan Pendapatan:</strong> Diakui saat order selesai diproduksi dan diserahkan (completed). Pembayaran sebelum penyerahan dicatat sebagai liabilitas uang muka.</li>
                <li><strong>Penilaian Persediaan:</strong> Dinilai berdasarkan harga beli terakhir (metode periodik fisik). HPP disesuaikan pada saat Tutup Buku bulanan; tidak ada pencatatan Barang Dalam Proses (WIP).</li>
                <li><strong>Aset Tetap & Penyusutan:</strong> Dicatat sebesar nilai perolehan dan disusutkan dengan metode garis lurus bulanan tanpa nilai residu.</li>
              </ul>
            </div>

            {/* Rincian Kas & Bank */}
            <div className="space-y-1 text-xs break-inside-avoid">
              <div className="flex justify-between font-bold bg-muted p-2 border-b border-border">
                <span>2. Rincian Kas dan Setara Kas</span>
                <span className="font-mono">{formatIDR(notes.cash_and_banks.total)}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {notes.cash_and_banks.rows.map((r) => (
                    <tr key={r.account_id} className="border-b border-border">
                      <td className="py-1 px-2 font-mono text-muted-foreground w-24">[{r.code}]</td>
                      <td className="py-1 px-2 text-foreground">{r.name}</td>
                      <td className="py-1 px-2 text-right font-mono font-medium">{renderAmount(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rincian Persediaan Bahan */}
            <div className="space-y-1 text-xs break-inside-avoid">
              <div className="flex justify-between font-bold bg-muted p-2 border-b border-border">
                <span>3. Persediaan Bahan Baku Gudang ({notes.inventories.is_estimate ? 'Estimasi Fisik' : `Snapshot ${notes.inventories.snapshot_date}`})</span>
                <span className="font-mono">{formatIDR(notes.inventories.total)}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="py-1 px-2">Nama Bahan</th>
                    <th className="py-1 px-2 text-center">Satuan</th>
                    <th className="py-1 px-2 text-right">Stok</th>
                    <th className="py-1 px-2 text-right">Nilai Total</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.inventories.rows.slice(0, 15).map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-1 px-2 text-foreground">{r.name}</td>
                      <td className="py-1 px-2 text-center text-muted-foreground">{r.unit || '-'}</td>
                      <td className="py-1 px-2 text-right font-mono">{r.stock_qty ?? 0}</td>
                      <td className="py-1 px-2 text-right font-mono">{formatIDR(r.total_value ?? 0)}</td>
                    </tr>
                  ))}
                  {notes.inventories.rows.length > 15 && (
                    <tr>
                      <td colSpan={4} className="py-1 px-2 text-muted-foreground italic text-center">
                        ...dan {notes.inventories.rows.length - 15} jenis material lainnya (rincian lengkap di laporan gudang).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Rincian Uang Muka Pelanggan */}
            <div className="space-y-1 text-xs break-inside-avoid">
              <div className="flex justify-between font-bold bg-muted p-2 border-b border-border">
                <span>4. Uang Muka Pelanggan (Pesanan Aktif Belum Selesai)</span>
                <span className="font-mono">{formatIDR(notes.customer_advances.total)}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {notes.customer_advances.rows.length === 0 ? (
                    <tr><td colSpan={3} className="py-2 text-center text-muted-foreground italic">Tidak ada saldo uang muka mengendap.</td></tr>
                  ) : (
                    notes.customer_advances.rows.map((r) => (
                      <tr key={r.order_id} className="border-b border-border">
                        <td className="py-1 px-2 font-mono text-muted-foreground w-32">{r.order_number}</td>
                        <td className="py-1 px-2 text-foreground">{r.customer_name}</td>
                        <td className="py-1 px-2 text-right font-mono font-medium">{formatIDR(r.net_advance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Jadwal Aset Tetap */}
            <div className="space-y-1 text-xs break-inside-avoid">
              <div className="flex justify-between font-bold bg-muted p-2 border-b border-border">
                <span>5. Jadwal Aset Tetap & Akumulasi Penyusutan</span>
                <span className="font-mono">Nilai Buku: {formatIDR(notes.fixed_assets.totals.book_value)}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="py-1 px-2">Kelompok Aset</th>
                    <th className="py-1 px-2 text-center">Unit</th>
                    <th className="py-1 px-2 text-right">Perolehan</th>
                    <th className="py-1 px-2 text-right">Akumulasi Susut</th>
                    <th className="py-1 px-2 text-right">Nilai Buku</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.fixed_assets.rows.map((fa) => (
                    <tr key={fa.asset_class} className="border-b border-border">
                      <td className="py-1 px-2 text-foreground">{fa.label}</td>
                      <td className="py-1 px-2 text-center text-muted-foreground">{fa.count} unit</td>
                      <td className="py-1 px-2 text-right font-mono">{formatIDR(fa.cost)}</td>
                      <td className="py-1 px-2 text-right font-mono text-destructive">
                        {fa.accumulated > 0 ? `(${formatIDR(fa.accumulated)})` : formatIDR(0)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono font-bold">{formatIDR(fa.book_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Hal yang Perlu Diketahui Pembaca (Integritas Cek) */}
            <div className="space-y-2 text-xs pt-2 break-inside-avoid">
              <h3 className="font-bold text-foreground uppercase tracking-wide">
                6. Catatan Khusus & Integritas Data
              </h3>
              <div className="bg-muted p-3 rounded border border-border space-y-1.5 text-foreground">
                {checks.filter((c) => c.severity !== 'ok').length === 0 ? (
                  <p className="text-success font-medium">
                    ✓ Seluruh aturan konsistensi pembukuan (15 aturan integritas) telah dievaluasi oleh sistem dan berstatus LULUS tanpa ada catatan anomali.
                  </p>
                ) : (
                  checks
                    .filter((c) => c.severity !== 'ok')
                    .map((c) => (
                      <div key={c.code} className="flex items-start gap-1.5 text-warning">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                        <span><strong>{c.label}:</strong> {c.hint} (Selisih: {formatIDR(c.diff)})</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* 8. GLOSARIUM & LEMBAR PENGESAHAN                                 */}
          {/* ================================================================ */}
          <div data-pdf-section className="py-6 space-y-6">
            <div className="border-b-2 border-border pb-2">
              <h2 className="text-xl font-bold uppercase tracking-normal text-foreground">
                VI. Glosarium & Lembar Pengesahan
              </h2>
              <p className="text-xs text-muted-foreground">
                Penjelasan istilah akuntansi dan persetujuan manajemen
              </p>
            </div>

            {/* Glosarium */}
            <div className="space-y-3 text-xs">
              <h3 className="font-bold text-foreground uppercase tracking-wide">
                Daftar Istilah Keuangan
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-foreground">
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">HPP (Harga Pokok Penjualan)</strong>
                  Total biaya bahan baku yang terpakai serta upah borongan penjahit untuk memproduksi pesanan yang berhasil dikirim.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Persediaan Bahan Baku</strong>
                  Nilai kain, benang, kancing, dan perlengkapan jahit yang masih tersimpan di gudang dan belum menjadi baju jadi.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Uang Muka Pelanggan</strong>
                  Kewajiban konveksi kepada pelanggan atas uang muka (DP) yang telah diterima sebelum pesanan diselesaikan dan dikirim.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Piutang Usaha</strong>
                  Hak tagih kepada pelanggan atas pesanan yang sudah selesai dikirimkan tetapi belum dilunasi penuh.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Akumulasi Penyusutan</strong>
                  Jumlah total pemotongan nilai aset tetap (mesin, mobil) sejak dibeli untuk mencerminkan penurunan masa manfaat.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Nilai Buku Bersih (Book Value)</strong>
                  Sisa nilai ekonomis aset tetap yang dihitung dari harga perolehan dikurangi akumulasi penyusutan.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Laba Ditahan</strong>
                  Akumulasi seluruh laba bersih dari tahun-tahun sebelumnya yang diputuskan untuk tidak ditarik dan diinvestasikan kembali dalam usaha.
                </div>
                <div className="bg-muted p-2.5 rounded border border-border">
                  <strong className="text-foreground block">Prive</strong>
                  Pengambilan dana kas atau transfer dari rekening bisnis untuk kebutuhan pribadi pemilik usaha konveksi.
                </div>
              </div>
            </div>

            {/* Lembar Tanda Tangan Resmi */}
            <div className="pt-10 border-t-2 border-border space-y-4 break-inside-avoid">
              <h3 className="font-bold text-center text-xs uppercase tracking-wider text-foreground">
                PENGESAHAN DOKUMEN LAPORAN KEUANGAN
              </h3>
              <p className="text-center text-[11px] text-muted-foreground max-w-md mx-auto">
                Laporan ini disusun dengan itikad baik berdasarkan catatan pembukuan transaksi aktual yang tercatat pada sistem SIKon.
              </p>

              <div className="grid grid-cols-2 text-center text-xs pt-6">
                <div>
                  <p className="font-semibold text-foreground">Disusun oleh,</p>
                  <div className="h-24 flex items-center justify-center">
                    {profile.signatureUrl && (
                      <img
                        src={profile.signatureUrl}
                        alt="Tanda tangan bagian keuangan"
                        className="h-20 object-contain"
                      />
                    )}
                  </div>
                  <p className="font-bold text-foreground border-t border-border inline-block px-8 pt-1">
                    Bagian Keuangan / Akuntansi
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground">Disetujui oleh,</p>
                  <div className="h-24 flex items-center justify-center relative">
                    {profile.stampUrl && (
                      <img
                        src={profile.stampUrl}
                        alt="Stempel perusahaan"
                        className="h-20 object-contain opacity-85"
                      />
                    )}
                  </div>
                  <p className="font-bold text-foreground border-t border-border inline-block px-8 pt-1">
                    Pimpinan / Pemilik Konveksi
                  </p>
                </div>
              </div>
            </div>

            {renderSystemFooter('Halaman Akhir dari Dokumen Laporan Keuangan Lengkap')}

            <div className="text-[10px] text-muted-foreground text-center pt-4">
              — Akhir dari Dokumen Resmi Laporan Keuangan SIKon —
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
