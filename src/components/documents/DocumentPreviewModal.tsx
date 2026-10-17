import React, { useState } from 'react';
import { X, Printer, FileText, Download, Loader2 } from 'lucide-react';
import Button from '../ui/button';
import PrintOptionsPanel from './PrintOptionsPanel';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import type { PrintSignatureMode } from '../../types';
import html2pdf from 'html2pdf.js';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  documentNo?: string;
  customerName?: string;
  documentType?: string;
  children: (printMode: PrintSignatureMode) => React.ReactNode;
}

function formatPrintTimestamp(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function sanitizeFilenamePart(str: string): string {
  return str.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  title,
  documentNo,
  customerName,
  documentType,
  children,
}: DocumentPreviewModalProps) {
  const { profile } = useCompanySettings();
  const [printMode, setPrintMode] = useState<PrintSignatureMode>('none');
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  // Format nama file: "nama dokumen_nama customer_no dokumen_waktu cetak.pdf"
  const docType =
    documentType ||
    (documentNo?.startsWith('PNW')
      ? 'Surat Penawaran'
      : documentNo?.startsWith('INV')
      ? 'Invoice'
      : documentNo?.startsWith('KWT')
      ? 'Kwitansi'
      : documentNo?.startsWith('NTA')
      ? 'Nota Pesanan'
      : title.replace('Pratinjau', '').replace('Cetak', '').trim() || 'Dokumen');

  const custName = sanitizeFilenamePart(customerName || 'Pelanggan');
  const docNo = sanitizeFilenamePart(documentNo || 'NO-DOC');
  const timestamp = formatPrintTimestamp();
  const generatedFilename = `${sanitizeFilenamePart(docType)}_${custName}_${docNo}_${timestamp}.pdf`;

  function handlePrint() {
    const originalTitle = document.title;
    // Mengubah title dokumen sementara agar saat "Save as PDF" di dialog print browser nama file default cocok
    // dan menghapus teks judul default "SIKon | Manajemen Pesanan & Keuangan" di header cetak
    document.title = generatedFilename.replace(/\.pdf$/, '');
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  }

  async function handleDownloadPdf() {
    const element = document.getElementById('printable-document-content');
    if (!element) return;

    try {
      setDownloading(true);

      const opt = {
        margin: [10, 12, 12, 12],
        filename: generatedFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
        pagebreak: {
          mode: ['avoid-all', 'css', 'legacy'],
          avoid: ['.break-inside-avoid', 'tr', '.signature-area'],
        },
      };

      await (html2pdf as any)().set(opt).from(element).save();
    } catch (err) {
      console.error('Error generating PDF with html2pdf:', err);
      // Fallback ke browser print dialog jika html2pdf mengalami kendala
      handlePrint();
    } finally {
      setDownloading(false);
    }
  }

  const hasSignature = Boolean(profile.signatureUrl);
  const hasStamp = Boolean(profile.stampUrl);

  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const printTimeStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200 print:bg-white print:p-0 print:static print:inset-auto print:z-0 print:block">
      <div className="print-document-modal w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900 print:max-h-none print:overflow-visible print:rounded-none print:shadow-none print:w-full print:max-w-none print:m-0">
        {/* Header - Screen Only */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3.5 print:hidden bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                {title}
              </h3>
              {documentNo && (
                <p className="text-xs font-mono font-medium text-slate-500">
                  {documentNo}
                  {customerName && <span className="ml-2 font-sans font-normal text-slate-400">· {customerName}</span>}
                </p>
              )}
            </div>
          </div>

          {/* Opsi TTD dan Tombol Aksi */}
          <div className="flex flex-wrap items-center gap-2.5">
            <PrintOptionsPanel
              mode={printMode}
              onChangeMode={setPrintMode}
              hasSignature={hasSignature}
              hasStamp={hasStamp}
            />

            {/* Tombol Langsung Download PDF */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="gap-1.5 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs"
              title={`Download langsung berkas PDF (${generatedFilename})`}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Download className="h-4 w-4 text-primary" />
              )}
              <span>{downloading ? 'Mengunduh...' : 'Download PDF'}</span>
            </Button>

            {/* Tombol Dialog Cetak / Simpan PDF Browser */}
            <Button
              variant="default"
              size="sm"
              onClick={handlePrint}
              disabled={downloading}
              className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              title="Buka dialog cetak browser atau simpan PDF sistem"
            >
              <Printer className="h-4 w-4" />
              <span>Cetak Dokumen</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
              aria-label="Tutup pratinjau"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100/50 print:bg-white print:p-0 print:overflow-visible">
          <div
            id="printable-document-content"
            className="print-content-sheet mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-none"
          >
            {children(printMode)}

            {/* FOOTER RESMI CETAK OTOMATIS OLEH SISTEM (MENGGANTIKAN URL & FOOTER BROWSER) */}
            <div className="mt-8 pt-4 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 break-inside-avoid print:break-inside-avoid">
              <p>
                Dokumen ini dicetak otomatis oleh sistem komputerisasi SIKon dan sah sebagai bukti resmi.
              </p>
              <p className="font-mono text-slate-600">
                Waktu Cetak: {printDateStr} {printTimeStr} WIB
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
