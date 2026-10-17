import React, { useState } from 'react';
import { X, Printer, FileText, Download, Loader2 } from 'lucide-react';
import Button from '../ui/button';
import PrintOptionsPanel from './PrintOptionsPanel';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import type { PrintSignatureMode } from '../../types';
import { createPortal } from 'react-dom';
import { downloadDocumentPdf, printDocument } from '../../utils/documentPdf';

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
    const element = document.getElementById('printable-document-content');
    if (element) void printDocument(element, generatedFilename);
  }

  async function handleDownloadPdf() {
    const element = document.getElementById('printable-document-content');
    if (!element) return;
    try {
      setDownloading(true);
      await downloadDocumentPdf(element, generatedFilename);
    } catch (err) {
      console.error('Gagal mengunduh PDF:', err);
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

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="document-preview-overlay fixed inset-0 z-50 flex items-center justify-center  p-4 backdrop-blur-sm animate-in fade-in duration-200 print:bg-white print:p-0 print:static print:inset-auto print:z-0 print:block">
      <div className="print-document-modal w-full max-w-5xl rounded-lg bg-card shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-foreground print:max-h-none print:overflow-visible print:rounded-none print:shadow-none print:w-full print:max-w-none print:m-0">
        {/* Header - Screen Only */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3.5 print:hidden bg-muted">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-tight">
                {title}
              </h3>
              {documentNo && (
                <p className="text-xs font-mono font-medium text-muted-foreground">
                  {documentNo}
                  {customerName && <span className="ml-2 font-sans font-normal text-muted-foreground">· {customerName}</span>}
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
              className="gap-1.5 text-xs border-border text-foreground hover:bg-muted shadow-xs"
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
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Tutup pratinjau"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="document-preview-scroll flex-1 overflow-auto p-4 sm:p-6 print:bg-white print:p-0 print:overflow-visible">
          <div
            id="printable-document-content"
            className="document-sheet print-content-sheet mx-auto shadow-soft print:border-none print:shadow-none print:p-0 print:max-w-none"
          >
            {children(printMode)}

            <div className="document-footer">
              <span>SIKon · {docType} · {documentNo}</span>
              <span>{printDateStr} · {printTimeStr}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
