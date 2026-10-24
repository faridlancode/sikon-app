import React from 'react';
import { Calendar, ShoppingBag, Layers, DollarSign, Lock, Unlock } from 'lucide-react';
import { PoBatchSummary } from '../../types';
import { getPoLabel, formatPoDateRange } from './poHelpers';

interface CurrentPoCardProps {
  batch: PoBatchSummary;
  onOpenCloseModal?: () => void;
  onOpenReopenModal?: () => void;
}

export const CurrentPoCard: React.FC<CurrentPoCardProps> = ({
  batch,
  onOpenCloseModal,
  onOpenReopenModal,
}) => {
  const isOpen = batch.status === 'open';

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-card-foreground">
      {/* Top Bar: Code, Label, Status, and Action Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold tracking-tight text-foreground">
              {batch.code}
            </span>
            <span className="text-base font-semibold text-primary">
              {getPoLabel(batch)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isOpen
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {isOpen ? 'Terbuka' : 'Ditutup'}
            </span>
          </div>

          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatPoDateRange(batch.start_date, batch.end_date)}</span>
            </div>
            {batch.closed_at && (
              <span className="italic text-muted-foreground">
                Ditutup pada: {new Date(batch.closed_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div>
          {isOpen ? (
            onOpenCloseModal && (
              <button
                onClick={onOpenCloseModal}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                <Lock className="h-4 w-4" />
                <span>Tutup PO</span>
              </button>
            )
          ) : (
            onOpenReopenModal && (
              <button
                onClick={onOpenReopenModal}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-amber-700 transition-colors"
              >
                <Unlock className="h-4 w-4" />
                <span>Buka Kembali PO</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Pesanan</span>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {batch.order_count}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Pesanan terdaftar di PO ini</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Qty (Pcs)</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {batch.total_qty} {batch.quota_qty != null && <span className="text-sm font-normal text-muted-foreground">/ {batch.quota_qty}</span>}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {batch.quota_qty != null ? `Kuota terisi ${batch.quota_used_pct ?? 0}%` : 'Tanpa batas kuota'}
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Nilai Pesanan</span>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            Rp {Number(batch.total_price || 0).toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Nilai komersial kotor</p>
        </div>
      </div>
    </div>
  );
};
