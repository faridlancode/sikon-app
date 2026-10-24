import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PoBatch, PoBatchSummary } from '../../types';

interface PastOpenWarningBannerProps {
  show: boolean;
  pastBatches?: (PoBatch | PoBatchSummary)[];
}

export const PastOpenWarningBanner: React.FC<PastOpenWarningBannerProps> = ({ show, pastBatches = [] }) => {
  if (!show) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">Perhatian: Ada Batch PO yang Telah Melewati Tanggal Selesai</p>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
          Terdapat Batch PO terbuka yang telah melewati batas tanggal selesai
          {pastBatches.length > 0 && (
            <span>
              {' '}(<strong>{pastBatches.map((b) => b.name).join(', ')}</strong>)
            </span>
          )}
          . Segera tutup PO tersebut jika pemesanan telah selesai agar rekapitulasi, pembekuan snapshot, dan urutan produksi dapat berjalan tertib.
        </p>
      </div>
    </div>
  );
};
