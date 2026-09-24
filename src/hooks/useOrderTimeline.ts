import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { OrderStageEvent, StageWorkLog, OrderStageName } from '../types';

export interface CuttingItemWithAssignment {
  id: string;
  order_id: string;
  product_id?: string | null;
  name_item: string;
  qty: number;
  cutting_completed_at?: string | null;
  cutting_qty?: number | null;
  products?: { id: string; name: string; cutting_cost_per_pcs: number } | null;
  cutting_assignments?: {
    id: string;
    staff_id: string;
    status: 'assigned' | 'done';
    assigned_at: string;
    notes?: string | null;
    staff?: { id: string; name: string; role?: string | null } | null;
  } | null;
}

export function useOrderTimeline(orderId?: string) {
  const [stages, setStages] = useState<OrderStageEvent[]>([]);
  const [workLogs, setWorkLogs] = useState<StageWorkLog[]>([]);
  const [cuttingItems, setCuttingItems] = useState<CuttingItemWithAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch stage events via get_order_stage_events RPC ─────────────────────
  const fetchStages = useCallback(async (targetOrderId?: string) => {
    const oid = targetOrderId || orderId;
    if (!oid) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_order_stage_events', {
        p_order_id: oid,
      });
      if (err) throw err;

      // Ambil juga data staff untuk stage yang punya staff_id
      const events: OrderStageEvent[] = (data as any[]) ?? [];
      const staffIds = events.map((e) => e.staff_id).filter(Boolean) as string[];
      let staffMap: Record<string, { id: string; name: string }> = {};

      if (staffIds.length > 0) {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, name')
          .in('id', staffIds);
        (staffData ?? []).forEach((s: any) => {
          staffMap[s.id] = s;
        });
      }

      setStages(
        events.map((e) => ({
          ...e,
          staff: e.staff_id ? staffMap[e.staff_id] ?? null : null,
        }))
      );
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat timeline order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // ── Fetch logs produktivitas finishing/qc/packaging ──────────────────────
  const fetchWorkLogs = useCallback(async (targetOrderId?: string) => {
    const oid = targetOrderId || orderId;
    if (!oid) return;

    try {
      const { data, error: err } = await supabase
        .from('stage_work_logs')
        .select(`
          id, order_id, order_item_id, stage, staff_id, qty, logged_at, notes,
          staff ( id, name, role ),
          order_items ( id, name_item )
        `)
        .eq('order_id', oid)
        .order('logged_at', { ascending: false });

      if (err) throw err;
      setWorkLogs((data as any[]) ?? []);
    } catch (e: any) {
      console.error('Gagal memuat stage work logs:', e);
    }
  }, [orderId]);

  // ── Fetch order_items beserta status potong ──────────────────────────────
  const fetchCuttingItems = useCallback(async (targetOrderId?: string) => {
    const oid = targetOrderId || orderId;
    if (!oid) return;

    try {
      const { data, error: err } = await supabase
        .from('order_items')
        .select(`
          id, order_id, product_id, name_item, qty, cutting_completed_at, cutting_qty,
          products ( id, name, cutting_cost_per_pcs ),
          cutting_assignments (
            id, staff_id, status, assigned_at, notes,
            staff ( id, name, role )
          )
        `)
        .eq('order_id', oid)
        .order('created_at', { ascending: true });

      if (err) throw err;

      // Bentuk assignment object (karena Supabase returns array untuk 1:1 jika tidak unique fk)
      const mapped: CuttingItemWithAssignment[] = (data ?? []).map((item: any) => {
        const assign = Array.isArray(item.cutting_assignments)
          ? item.cutting_assignments[0] ?? null
          : item.cutting_assignments ?? null;
        return {
          ...item,
          cutting_assignments: assign,
        };
      });

      setCuttingItems(mapped);
    } catch (e: any) {
      console.error('Gagal memuat item potong:', e);
    }
  }, [orderId]);

  // ── Toggle manual stage (selain potong & jahit) ───────────────────────────
  const toggleStage = useCallback(
    async (stage: OrderStageName, done: boolean, notes?: string, targetOrderId?: string) => {
      const oid = targetOrderId || orderId;
      if (!oid) throw new Error('Order ID tidak ditemukan');

      setActionLoading(true);
      setError(null);
      try {
        const { error: err } = await supabase.rpc('toggle_order_stage', {
          p_order_id: oid,
          p_stage: stage,
          p_done: done,
          p_notes: notes ?? null,
        });
        if (err) throw err;
        await fetchStages(oid);
      } catch (e: any) {
        setError(e.message ?? 'Gagal mengubah status stage');
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [orderId, fetchStages]
  );

  // ── Catat log kerja Finishing / QC / Packaging ───────────────────────────
  const logWork = useCallback(
    async (
      stage: 'finishing' | 'qc' | 'packaging',
      staffId: string,
      qty: number,
      orderItemId?: string | null,
      notes?: string | null,
      targetOrderId?: string
    ) => {
      const oid = targetOrderId || orderId;
      if (!oid) throw new Error('Order ID tidak ditemukan');

      setActionLoading(true);
      setError(null);
      try {
        const { error: err } = await supabase.rpc('log_stage_work', {
          p_order_id: oid,
          p_stage: stage,
          p_staff_id: staffId,
          p_qty: qty,
          p_order_item_id: orderItemId ?? null,
          p_notes: notes ?? null,
        });
        if (err) throw err;
        await fetchWorkLogs(oid);
      } catch (e: any) {
        setError(e.message ?? 'Gagal mencatat log kerja');
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [orderId, fetchWorkLogs]
  );

  // ── Assign item potong langsung dari timeline ─────────────────────────────
  const assignCuttingItem = useCallback(
    async (orderItemId: string, staffId: string, notes?: string, targetOrderId?: string) => {
      const oid = targetOrderId || orderId;
      setActionLoading(true);
      setError(null);
      try {
        const { error: err } = await supabase.rpc('assign_cutting_item', {
          p_order_item_id: orderItemId,
          p_staff_id: staffId,
          p_notes: notes ?? null,
        });
        if (err) throw err;
        await Promise.all([fetchCuttingItems(oid), fetchStages(oid)]);
      } catch (e: any) {
        setError(e.message ?? 'Gagal assign item potong');
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [orderId, fetchCuttingItems, fetchStages]
  );

  // ── Tandai item potong selesai langsung dari timeline ─────────────────────
  const markCuttingItemDone = useCallback(
    async (orderItemId: string, cuttingQty?: number, notes?: string, targetOrderId?: string) => {
      const oid = targetOrderId || orderId;
      setActionLoading(true);
      setError(null);
      try {
        const { error: err } = await supabase.rpc('mark_cutting_item_done', {
          p_order_item_id: orderItemId,
          p_cutting_qty: cuttingQty ?? null,
          p_notes: notes ?? null,
        });
        if (err) throw err;
        await Promise.all([fetchCuttingItems(oid), fetchStages(oid)]);
      } catch (e: any) {
        setError(e.message ?? 'Gagal menandai item potong selesai');
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [orderId, fetchCuttingItems, fetchStages]
  );

  // ── Refresh all data for order ───────────────────────────────────────────
  const refetchAll = useCallback(
    async (targetOrderId?: string) => {
      const oid = targetOrderId || orderId;
      if (!oid) return;
      await Promise.all([fetchStages(oid), fetchWorkLogs(oid), fetchCuttingItems(oid)]);
    },
    [orderId, fetchStages, fetchWorkLogs, fetchCuttingItems]
  );

  return {
    stages,
    workLogs,
    cuttingItems,
    loading,
    actionLoading,
    error,
    fetchStages,
    fetchWorkLogs,
    fetchCuttingItems,
    toggleStage,
    logWork,
    assignCuttingItem,
    markCuttingItemDone,
    refetchAll,
  };
}
