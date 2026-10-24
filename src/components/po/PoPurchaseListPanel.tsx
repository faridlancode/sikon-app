import React, { useEffect, useState, useCallback } from 'react';
import {
  ShoppingBag,
  RefreshCw,
  Package,
  CheckCircle2,
  Clock,
  Sparkles,
  Truck,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../ui/button';

interface PurchaseListItem {
  material_id: string;
  material_name: string;
  material_color_id: string | null;
  color_name: string | null;
  unit: string;
  total_quantity_needed: number;
  total_quantity_fulfilled: number;
  total_request_count: number;
  status_breakdown: {
    draft_auto: number;
    pending: number;
    in_progress: number;
    fulfilled: number;
    cancelled: number;
  };
}

interface PurchaseListData {
  po_batch: {
    id: string;
    code: string;
    name: string;
    status: string;
  };
  items: PurchaseListItem[];
}

interface PoPurchaseListPanelProps {
  batchId: string;
  batchName: string;
}

export function PoPurchaseListPanel({ batchId, batchName }: PoPurchaseListPanelProps) {
  const [data, setData] = useState<PurchaseListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPurchaseList = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: rpcError } = await supabase.rpc('get_po_purchase_list', {
        p_batch_id: batchId,
      });

      if (rpcError) throw rpcError;
      setData(res as PurchaseListData);
    } catch (err: any) {
      console.error('Gagal mengambil daftar belanja PO:', err);
      setError(err?.message || 'Gagal memuat daftar belanja PO');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    fetchPurchaseList();
  }, [fetchPurchaseList]);

  function getStatusBadge(item: PurchaseListItem) {
    const needed = Number(item.total_quantity_needed) || 0;
    const fulfilled = Number(item.total_quantity_fulfilled) || 0;
    const sb = item.status_breakdown || {
      draft_auto: 0,
      pending: 0,
      in_progress: 0,
      fulfilled: 0,
      cancelled: 0,
    };

    if (fulfilled >= needed && needed > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Terpenuhi
        </span>
      );
    }

    if (sb.in_progress > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
          <Truck className="h-3 w-3 text-blue-600" />
          Sebagian Diproses
        </span>
      );
    }

    if (sb.pending > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
          <Clock className="h-3 w-3 text-amber-600" />
          Siap Diproses (Pending)
        </span>
      );
    }

    if (sb.draft_auto > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          <Sparkles className="h-3 w-3 text-amber-600" />
          Draft Otomatis
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
        Menunggu
      </span>
    );
  }

  const items = data?.items || [];

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Daftar Belanja Kebutuhan {batchName}
            </h3>
            <p className="text-xs text-muted-foreground">
              Agregat kebutuhan bahan baku dari pengajuan restock (stock_requests) yang terhubung ke Batch PO ini.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchPurchaseList}
          disabled={loading}
          className="h-8 gap-1.5 text-xs self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-xs font-semibold text-foreground">
            Belum ada kebutuhan belanja bahan untuk Batch PO ini
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground max-w-sm">
            Pengajuan restock otomatis yang dihasilkan pesanan dalam PO ini atau pengajuan manual gudang dengan referensi PO akan terangkum di sini.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Material</th>
                <th className="py-2.5 px-3">Varian Warna</th>
                <th className="py-2.5 px-3 text-right">Kebutuhan</th>
                <th className="py-2.5 px-3 text-right">Terpenuhi</th>
                <th className="py-2.5 px-3 text-center">Jml Pengajuan</th>
                <th className="py-2.5 px-3">Status Belanja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {items.map((item, idx) => {
                const needed = Number(item.total_quantity_needed) || 0;
                const fulfilled = Number(item.total_quantity_fulfilled) || 0;
                const pct = needed > 0 ? Math.min(Math.round((fulfilled / needed) * 100), 100) : 0;

                return (
                  <tr key={`${item.material_id}-${item.material_color_id || 'none'}-${idx}`} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      {item.material_name}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {item.color_name ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <span className="h-2 w-2 rounded-full border border-slate-300 bg-slate-400" />
                          {item.color_name}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-foreground whitespace-nowrap">
                      {needed.toLocaleString('id-ID')} <span className="text-[11px] text-muted-foreground">{item.unit}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-foreground whitespace-nowrap">
                      <span className={fulfilled >= needed && needed > 0 ? 'text-emerald-600 font-bold' : ''}>
                        {fulfilled.toLocaleString('id-ID')}
                      </span>{' '}
                      <span className="text-[11px] text-muted-foreground">{item.unit}</span>
                      {needed > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({pct}%)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground font-medium">
                      {item.total_request_count} baris
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getStatusBadge(item)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
