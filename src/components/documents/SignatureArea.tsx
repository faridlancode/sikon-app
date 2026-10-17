import React from 'react';
import type { PrintSignatureMode } from '../../types';

interface SignatureAreaProps {
  mode: PrintSignatureMode;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  leftTitle?: string;
  leftSigner?: string;
  leftRole?: string;
  rightTitle?: string;
  rightSigner?: string;
  rightRole?: string;
}

export default function SignatureArea({
  mode,
  signatureUrl,
  stampUrl,
  leftTitle = 'Disetujui oleh (Pelanggan),',
  leftSigner = 'Tanda Tangan & Nama Terang',
  leftRole,
  rightTitle = 'Hormat kami,',
  rightSigner = 'Pimpinan / Manajemen',
  rightRole = 'PT Mad Ali Indonesia',
}: SignatureAreaProps) {
  const showSignature = mode === 'signature_only' || mode === 'signature_and_stamp';
  const showStamp = mode === 'signature_and_stamp';

  return (
    <div className="pt-6 border-t border-slate-300 grid grid-cols-2 text-center text-xs break-inside-avoid">
      {/* Sisi Kiri: Pelanggan / Penerima */}
      <div className="flex flex-col items-center">
        <p className="font-semibold text-slate-700">{leftTitle}</p>
        <div className="h-24 w-48 flex items-center justify-center">
          {/* Sisi kiri selalu kosong untuk ditandatangani fisik oleh pelanggan */}
        </div>
        <p className="font-bold text-slate-900 border-t border-slate-400 min-w-[160px] pt-1">
          {leftSigner}
        </p>
        {leftRole && <p className="text-[11px] text-slate-500 mt-0.5">{leftRole}</p>}
      </div>

      {/* Sisi Kanan: Perusahaan (PT Mad Ali Indonesia) */}
      <div className="flex flex-col items-center">
        <p className="font-semibold text-slate-700">{rightTitle}</p>
        <div className="h-24 w-48 flex items-center justify-center relative">
          {/* Tanda Tangan */}
          {showSignature && signatureUrl && (
            <img
              src={signatureUrl}
              alt="Tanda Tangan"
              className="h-20 object-contain z-10"
            />
          )}

          {/* Stempel Perusahaan (Semi-transparan menimpa tanda tangan) */}
          {showStamp && stampUrl && (
            <img
              src={stampUrl}
              alt="Stempel"
              className="h-20 object-contain absolute opacity-80 mix-blend-multiply pointer-events-none z-20 transform rotate-[-6deg]"
            />
          )}
        </div>
        <p className="font-bold text-slate-900 border-t border-slate-400 min-w-[160px] pt-1">
          {rightSigner}
        </p>
        {rightRole && <p className="text-[11px] text-slate-500 mt-0.5">{rightRole}</p>}
      </div>
    </div>
  );
}
