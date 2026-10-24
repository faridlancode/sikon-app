/**
 * PdfPreviewDialog.tsx
 *
 * Dialog pratinjau PDF — layout DUA KOLOM:
 *  LEFT : kontrol (judul, opsi TTD/cap, sideContent, tombol cetak/download)
 *  RIGHT: iframe blob URL PDF (preview langsung)
 */
import React, { useRef } from 'react';
import { X, Download, Printer, Loader2, PenTool } from 'lucide-react';

export type SignatureMode = 'none' | 'signature_only' | 'signature_and_stamp';

interface PdfPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  pdfUrl: string | null;
  onDownload?: () => void | Promise<void>;
  downloading?: boolean;
  /** Konten tambahan di panel kiri (mis. textarea keterangan) */
  sideContent?: React.ReactNode;
  signatureMode?: SignatureMode;
  onSignatureModeChange?: (mode: SignatureMode) => void;
  hasSignature?: boolean;
  hasStamp?: boolean;
}

export default function PdfPreviewDialog({
  open,
  onClose,
  title,
  subtitle,
  pdfUrl,
  onDownload,
  downloading = false,
  sideContent,
  signatureMode,
  onSignatureModeChange,
  hasSignature = false,
  hasStamp = false,
}: PdfPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const showOptions = Boolean(onSignatureModeChange);

  if (!open) return null;

  function handlePrint() {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog — 2 kolom */}
      <div
        className="relative z-10 flex w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border border-border bg-card"
        style={{ height: 'calc(100vh - 3rem)', maxHeight: '940px' }}
      >
        {/* ── PANEL KIRI ── */}
        <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
          {/* Judul + Tutup */}
          <div className="flex items-start justify-between px-4 pt-4 pb-3">
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-sm font-semibold text-foreground leading-tight truncate">{title}</h2>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-border mx-4" />

          {/* Opsi Tanda Tangan & Stempel */}
          {showOptions && (
            <div className="px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
                <PenTool className="h-3.5 w-3.5 text-primary" />
                Tanda Tangan &amp; Cap
              </p>
              <div className="flex flex-col gap-1">
                {(
                  [
                    { val: 'none', label: 'Kosong (TTD Fisik)', disabled: false },
                    { val: 'signature_only', label: 'TTD Digital', disabled: !hasSignature, hint: !hasSignature ? '— belum diatur' : '' },
                    { val: 'signature_and_stamp', label: 'TTD + Cap', disabled: !hasSignature || !hasStamp, hint: !hasStamp ? '— cap belum diatur' : '' },
                  ] as { val: SignatureMode; label: string; disabled: boolean; hint?: string }[]
                ).map(({ val, label, disabled, hint }) => (
                  <button
                    key={val}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSignatureModeChange?.(val)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                      signatureMode === val
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-foreground hover:bg-muted'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {label}
                    {hint && <span className="text-[10px] opacity-70 ml-1">{hint}</span>}
                  </button>
                ))}
              </div>
              {!pdfUrl && signatureMode !== 'none' && (
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Memperbarui...
                </p>
              )}
            </div>
          )}

          {/* sideContent (mis. textarea keterangan invoice) */}
          {sideContent && (
            <>
              <div className="h-px bg-border mx-4" />
              <div className="px-4 py-3">{sideContent}</div>
            </>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Divider */}
          <div className="h-px bg-border mx-4 mb-3" />

          {/* Tombol Aksi */}
          <div className="px-4 pb-4 flex flex-col gap-2">
            {onDownload && (
              <button
                onClick={onDownload}
                disabled={!pdfUrl || downloading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloading ? 'Mengunduh...' : 'Download PDF'}
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={!pdfUrl}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak
            </button>
          </div>
        </div>

        {/* ── PANEL KANAN (iframe) ── */}
        <div className="flex-1 bg-muted/20">
          {pdfUrl ? (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              title={title}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Membuat pratinjau PDF...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
