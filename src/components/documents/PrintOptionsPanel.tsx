import React from 'react';
import { PenTool, CheckSquare, Square } from 'lucide-react';
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
      <span className="font-semibold text-slate-600 flex items-center gap-1">
        <PenTool className="h-3.5 w-3.5 text-primary" />
        Tanda Tangan & Cap:
      </span>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => onChangeMode('none')}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            mode === 'none'
              ? 'bg-primary text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Area tanda tangan kosong untuk tanda tangan dan cap fisik"
        >
          Kosong (Fisik)
        </button>

        <button
          type="button"
          onClick={() => onChangeMode('signature_only')}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            mode === 'signature_only'
              ? 'bg-primary text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          } ${!hasSignature ? 'opacity-60' : ''}`}
          title={hasSignature ? 'Tampilkan gambar tanda tangan saja' : 'Gambar tanda tangan belum diatur di Profil Perusahaan'}
        >
          TTD Saja {!hasSignature && '(Belum Ada)'}
        </button>

        <button
          type="button"
          onClick={() => onChangeMode('signature_and_stamp')}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            mode === 'signature_and_stamp'
              ? 'bg-primary text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          } ${!hasSignature || !hasStamp ? 'opacity-60' : ''}`}
          title={hasStamp ? 'Tampilkan tanda tangan digital dan stempel perusahaan' : 'Gambar stempel belum diatur di Profil Perusahaan'}
        >
          TTD + Cap {!hasStamp && '(Cap Belum Ada)'}
        </button>
      </div>
    </div>
  );
}
