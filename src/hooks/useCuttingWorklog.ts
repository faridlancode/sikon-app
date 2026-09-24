import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { CuttingAssignment } from '../types';

export function useCuttingWorklog() {
  const [cuttingAssignments, setCuttingAssignments] = useState<CuttingAssignment[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch cutting assignments aktif ──────────────────────────────────────
  const fetchCuttingAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('cutting_assignments')
        .select(`
          id, order_item_id, staff_id, assigned_at, status, notes,
          staff ( id, name, role ),
          order_items (
            id, order_id, product_id, name_item, qty, cutting_completed_at, cutting_qty,
            orders ( id, order_id, customer_name, production_status, total_price, order_date ),
            products ( id, name, cutting_cost_per_pcs )
          )
        `)
        .order('assigned_at', { ascending: false });

      if (err) throw err;
      setCuttingAssignments((data as any[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat cutting assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch order items yang belum dipotong & belum punya assignment aktif ───
  // Syarat antri potong: stage 'rekap' pada order_stage_events harus sudah 'done'
  const fetchUnassignedItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Ambil order_id yang stage 'rekap'-nya sudah 'done' (siap potong)
      const { data: readyStageEvents, error: stageErr } = await supabase
        .from('order_stage_events')
        .select('order_id')
        .eq('stage', 'rekap')
        .eq('status', 'done');

      if (stageErr) throw stageErr;

      const readyOrderIds = (readyStageEvents ?? [])
        .map((r: any) => r.order_id)
        .filter(Boolean);

      // Jika belum ada order yang rekap-nya selesai, antrian potong kosong
      if (readyOrderIds.length === 0) {
        setUnassignedItems([]);
        return;
      }

      // 2. Ambil id item yang sudah di-assign dengan status 'assigned'
      const { data: activeAssignments } = await supabase
        .from('cutting_assignments')
        .select('order_item_id')
        .eq('status', 'assigned');

      const assignedIds = (activeAssignments ?? [])
        .map((r: any) => r.order_item_id)
        .filter(Boolean);

      let query = supabase
        .from('order_items')
        .select(`
          id, order_id, product_id, name_item, qty, cutting_completed_at, cutting_qty,
          orders ( id, order_id, customer_name, production_status, total_price, order_date ),
          products ( id, name, cutting_cost_per_pcs )
        `)
        .is('cutting_completed_at', null)
        .in('order_id', readyOrderIds)
        .order('created_at', { ascending: false });

      if (assignedIds.length > 0) {
        query = query.not('id', 'in', `(${assignedIds.join(',')})`);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setUnassignedItems((data as any[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat order items yang belum di-assign');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Assign order item ke tukang potong ─────────────────────────────────────
  const assignCuttingItem = useCallback(
    async (orderItemId: string, staffId: string, notes?: string | null) => {
      try {
        const { error: err } = await supabase.rpc('assign_cutting_item', {
          p_order_item_id: orderItemId,
          p_staff_id: staffId,
          p_notes: notes ?? null,
        });
        if (err) throw err;
      } catch (err: any) {
        const isOrderIdConstraint =
          err?.message?.includes('order_id') ||
          err?.message?.includes('violates not-null constraint');

        if (isOrderIdConstraint) {
          // Fallback bila function RPC di database masih versi lama tanpa order_id
          const { data: itemData, error: itemErr } = await supabase
            .from('order_items')
            .select('order_id, cutting_completed_at')
            .eq('id', orderItemId)
            .single();

          if (itemErr || !itemData) {
            throw new Error(itemErr?.message || 'Item order tidak ditemukan');
          }

          if (itemData.cutting_completed_at) {
            throw new Error('Item ini sudah selesai dipotong — tidak bisa di-assign ulang');
          }

          // Validasi tahap rekap
          const { data: stageDone } = await supabase
            .from('order_stage_events')
            .select('id')
            .eq('order_id', itemData.order_id)
            .eq('stage', 'rekap')
            .eq('status', 'done')
            .maybeSingle();

          if (!stageDone) {
            throw new Error('Order belum siap potong. Pastikan tahap rekap order sudah selesai terlebih dahulu.');
          }

          const { error: upsertErr } = await supabase
            .from('cutting_assignments')
            .upsert(
              {
                order_id: itemData.order_id,
                order_item_id: orderItemId,
                staff_id: staffId,
                notes: notes ?? null,
                status: 'assigned',
                assigned_at: new Date().toISOString(),
              },
              { onConflict: 'order_item_id' }
            );

          if (upsertErr) throw new Error(upsertErr.message);
        } else {
          throw err;
        }
      }

      await Promise.all([fetchCuttingAssignments(), fetchUnassignedItems()]);
    },
    [fetchCuttingAssignments, fetchUnassignedItems]
  );

  // ── Tandai order item selesai dipotong (event-driven) ──────────────────────
  const markCuttingItemDone = useCallback(
    async (orderItemId: string, cuttingQty?: number | null, notes?: string | null) => {
      const { error: err } = await supabase.rpc('mark_cutting_item_done', {
        p_order_item_id: orderItemId,
        p_cutting_qty: cuttingQty ?? null,
        p_notes: notes ?? null,
      });
      if (err) throw new Error(err.message);
      await Promise.all([fetchCuttingAssignments(), fetchUnassignedItems()]);
    },
    [fetchCuttingAssignments, fetchUnassignedItems]
  );

  // ── Refetch all ──────────────────────────────────────────────────────────
  const refetchAll = useCallback(async () => {
    await Promise.all([fetchCuttingAssignments(), fetchUnassignedItems()]);
  }, [fetchCuttingAssignments, fetchUnassignedItems]);

  return {
    cuttingAssignments,
    unassignedItems,
    // Alias untuk backwards compatibility
    unassignedOrders: unassignedItems,
    loading,
    error,
    fetchCuttingAssignments,
    fetchUnassignedItems,
    fetchUnassignedOrders: fetchUnassignedItems,
    assignCuttingItem,
    // Alias untuk backward compatibility
    assignCuttingOrder: assignCuttingItem,
    markCuttingItemDone,
    refetchAll,
  };
}
