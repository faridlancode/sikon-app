import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PoBatchSummary, Order } from '../types';
import { todayISO } from '../utils/dateHelpers';

export function usePoBatches() {
  const [batches, setBatches] = useState<PoBatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchOrders, setBatchOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch daftar batch PO summary (dengan filter status, tahun & bulan opsional)
  const fetchBatches = useCallback(async (params?: {
    status?: string | null;
    year?: number | null;
    month?: number | null;
  }) => {
    setLoadingBatches(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('list_po_batches_summary', {
        p_status: params?.status || null,
        p_year: params?.year ?? null,
        p_month: params?.month ?? null,
      });

      if (rpcError) {
        throw rpcError;
      }

      const list = (data || []) as PoBatchSummary[];
      setBatches(list);

      // Bila ada selectedBatchId tapi tidak ada di list, atau belum ada yang terpilih, pilih batch pertama (terutama yang open)
      setSelectedBatchId((prev) => {
        if (prev && list.some((b) => b.id === prev)) {
          return prev;
        }
        const openBatch = list.find((b) => b.status === 'open');
        return openBatch ? openBatch.id : list[0]?.id || null;
      });

      return list;
    } catch (err: any) {
      console.error('Error fetching PO batches summary:', err);
      const msg = err?.message || 'Gagal memuat daftar Batch PO';
      setError(msg);
      return [];
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  // 2. Fetch order untuk PO tertentu
  const fetchOrdersForBatch = useCallback(async (batchId: string) => {
    if (!batchId) {
      setBatchOrders([]);
      return [];
    }
    setLoadingOrders(true);
    try {
      const { data, error: queryError } = await supabase
        .from('orders_with_balance')
        .select('*')
        .eq('po_batch_id', batchId)
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (queryError) {
        throw queryError;
      }
      const orderIds = (data || []).map((o: any) => o.id).filter(Boolean);
      let rekapDoneSet = new Set<string>();
      if (orderIds.length > 0) {
        const { data: stageData } = await supabase
          .from('order_stage_events')
          .select('order_id, status')
          .eq('stage', 'rekap')
          .eq('status', 'done')
          .in('order_id', orderIds);
        if (stageData) {
          rekapDoneSet = new Set(stageData.map((s: any) => s.order_id));
        }
      }

      const list = (data || []).map((o: any) => ({
        ...o,
        is_rekap_done: rekapDoneSet.has(o.id) || !!o.released_early_at,
      })) as Order[];
      setBatchOrders(list);
      return list;
    } catch (err: any) {
      console.error('Error fetching orders for batch:', err);
      return [];
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // 3. Tambah PO Baru
  const createPoBatch = useCallback(
    async (params: {
      name: string;
      startDate: string;
      endDate: string;
      periodYear: number;
      periodMonth: number;
      quotaQty?: number | null;
      note?: string | null;
    }) => {
      setError(null);
      try {
        const { data, error: rpcError } = await (supabase as any).rpc('create_po_batch', {
          p_name: params.name,
          p_start_date: params.startDate,
          p_end_date: params.endDate,
          p_period_year: params.periodYear,
          p_period_month: params.periodMonth,
          p_quota_qty: params.quotaQty ?? null,
          p_note: params.note || null,
        });

        if (rpcError) {
          throw rpcError;
        }

        await fetchBatches();
        if (data?.id) {
          setSelectedBatchId(data.id);
        }
        return { success: true, data };
      } catch (err: any) {
        console.error('Error creating PO batch:', err);
        const msg = err?.message || 'Gagal membuat Batch PO';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [fetchBatches]
  );

  // 4. Update PO
  const updatePoBatch = useCallback(
    async (params: {
      batchId: string;
      name: string;
      startDate: string;
      endDate: string;
      periodYear: number;
      periodMonth: number;
      quotaQty?: number | null;
      note?: string | null;
    }) => {
      setError(null);
      try {
        const { data, error: rpcError } = await (supabase as any).rpc('update_po_batch', {
          p_batch_id: params.batchId,
          p_name: params.name,
          p_start_date: params.startDate,
          p_end_date: params.endDate,
          p_period_year: params.periodYear,
          p_period_month: params.periodMonth,
          p_quota_qty: params.quotaQty ?? null,
          p_note: params.note || null,
        });

        if (rpcError) {
          throw rpcError;
        }

        await fetchBatches();
        return { success: true, data };
      } catch (err: any) {
        console.error('Error updating PO batch:', err);
        const msg = err?.message || 'Gagal memperbarui Batch PO';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [fetchBatches]
  );

  // 5. Hapus PO
  const deletePoBatch = useCallback(
    async (batchId: string) => {
      setError(null);
      try {
        const { error: rpcError } = await (supabase as any).rpc('delete_po_batch', {
          p_batch_id: batchId,
        });

        if (rpcError) {
          throw rpcError;
        }

        await fetchBatches();
        return { success: true };
      } catch (err: any) {
        console.error('Error deleting PO batch:', err);
        const msg = err?.message || 'Gagal menghapus Batch PO';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [fetchBatches]
  );

  // 6. Tutup PO
  const closePo = useCallback(
    async (params: {
      batchId: string;
      earlyReason?: string;
      markRekap?: boolean;
      note?: string;
    }) => {
      setError(null);
      try {
        const { data, error: rpcError } = await (supabase as any).rpc('close_po_batch', {
          p_batch_id: params.batchId,
          p_early_reason: params.earlyReason || null,
          p_mark_rekap: params.markRekap ?? false,
          p_note: params.note || null,
        });

        if (rpcError) {
          throw rpcError;
        }

        await fetchBatches();
        await fetchOrdersForBatch(params.batchId);
        return { success: true, snapshot: data };
      } catch (err: any) {
        console.error('Error closing PO batch:', err);
        const msg = err?.message || 'Gagal menutup Batch PO';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [fetchBatches, fetchOrdersForBatch]
  );

  // 7. Buka Kembali PO
  const reopenPo = useCallback(
    async (params: { batchId: string; reason: string }) => {
      setError(null);
      try {
        const { error: rpcError } = await (supabase as any).rpc('reopen_po_batch', {
          p_batch_id: params.batchId,
          p_reason: params.reason,
        });

        if (rpcError) {
          throw rpcError;
        }

        await fetchBatches();
        await fetchOrdersForBatch(params.batchId);
        return { success: true };
      } catch (err: any) {
        console.error('Error reopening PO batch:', err);
        const msg = err?.message || 'Gagal membuka kembali Batch PO';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [fetchBatches, fetchOrdersForBatch]
  );

  // Initial load
  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Load orders ketika selectedBatchId berubah
  useEffect(() => {
    if (selectedBatchId) {
      fetchOrdersForBatch(selectedBatchId);
    } else {
      setBatchOrders([]);
    }
  }, [selectedBatchId, fetchOrdersForBatch]);

  const todayStr = todayISO();
  const pastOpenBatches = batches.filter(
    (b) => b.status === 'open' && b.end_date < todayStr
  );
  const hasPastOpenBatches = pastOpenBatches.length > 0;

  return {
    batches,
    loadingBatches,
    selectedBatchId,
    setSelectedBatchId,
    selectedBatchOrders: batchOrders,
    loadingOrders,
    error,
    pastOpenBatches,
    hasPastOpenBatches,
    fetchBatches,
    fetchOrdersForBatch,
    createPoBatch,
    updatePoBatch,
    deletePoBatch,
    closePo,
    reopenPo,
  };
}
