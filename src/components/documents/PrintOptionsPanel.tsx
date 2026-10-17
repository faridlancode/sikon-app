import React from 'react';
import { PenTool } from 'lucide-react';
import Button from '../ui/button';
import type { PrintSignatureMode } from '../../types';

interface PrintOptionsPanelProps {
  mode: PrintSignatureMode;
  onChangeMode: (mode: PrintSignatureMode) => void;
  hasSignature: boolean;
  hasStamp: boolean;
}

export default function PrintOptionsPanel({
  mode,
  onChangeMode,
  hasSignature,
  hasStamp,
}: PrintOptionsPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-muted-foreground flex items-center gap-1">
        <PenTool className="h-3.5 w-3.5 text-primary" />
        Tanda Tangan & Cap:
      </span>

      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm">
        <Button size="sm" variant="ghost"
          type="button"
          onClick={() => onChangeMode('none')}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            mode === 'none'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Area tanda tangan kosong untuk tanda tangan dan cap fisik"
        >
          Kosong (Fisik)
        </Button>

        <Button size="sm" variant="ghost"
          type="button"
          disabled={!hasSignature}
          onClick={() => onChangeMode('signature_only')}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            mode === 'signature_only'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          } ${!hasSignature ? 'opacity-60' : ''}`}
          title={hasSignature ? 'Tampilkan gambar tanda tangan saja' : 'Gambar tanda tangan belum diatur di Profil Perusahaan'}
        >
          TTD Saja {!hasSignature && '(Belum Ada)'}
        </Button>

        <Button size="sm" variant="ghost"
          type="button"
          disabled={!hasSignature || !hasStamp}
          onClick={() => onChangeMode('signature_and_stamp')}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            mode === 'signature_and_stamp'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          } ${!hasSignature || !hasStamp ? 'opacity-60' : ''}`}
          title={hasStamp ? 'Tampilkan tanda tangan digital dan stempel perusahaan' : 'Gambar stempel belum diatur di Profil Perusahaan'}
        >
          TTD + Cap {!hasStamp && '(Cap Belum Ada)'}
        </Button>
      </div>
    </div>
  );
}
