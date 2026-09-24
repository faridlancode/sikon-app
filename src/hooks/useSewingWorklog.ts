import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  SewingAssignment,
  SewingDistributionBatch,
  OrderItem,
  PieceworkTask,
} from '../types';

export function useSewingWorklog() {
  const [sewingPool, setSewingPool] = useState<OrderItem[]>([]);
  const [assignments, setAssignments] = useState<SewingAssignment[]>([]);
  const [batches, setBatches] = useState<SewingDistributionBatch[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PieceworkTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch order_items yang siap dijahit & belum fully-assigned ─────────────
  const fetchSewingPool = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('order_items')
        .select(`
          id, order_id, name_item, qty, product_id, ready_for_sewing_at, created_at,
          orders!inner ( id, order_id, customer_name, production_status ),
          products ( id, name, sewing_cost_per_pcs ),
          sewing_assignments ( id, assigned_qty, qc_passed_qty, status )
        `)
        .not('ready_for_sewing_at', 'is', null)
        .order('ready_for_sewing_at', { ascending: true });

      if (err) throw err;

      const items = ((data as any[]) ?? []).map((item) => {
        const assignedTotal = (item.sewing_assignments ?? []).reduce(
          (sum: number, a: any) => sum + (Number(a.assigned_qty) || 0),
          0
        );
        const itemQty = Number(item.qty) || 0;
        const remainingQty = Math.max(0, itemQty - assignedTotal);
        let poolStatus: 'waiting' | 'partial' | 'distributed' = 'waiting';
        if (remainingQty <= 0) {
          poolStatus = 'distributed';
        } else if (assignedTotal > 0) {
          poolStatus = 'partial';
        }

        return {
          ...item,
          assigned_qty: assignedTotal,
          remaining_qty: remainingQty,
          pool_status: poolStatus,
        };
      });

      setSewingPool(items);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat antrian jahit');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch sewing assignments (beban penjahit) ─────────────────────────────
  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('sewing_assignments')
        .select(`
          id, order_item_id, staff_id, batch_id, assigned_qty, sewn_qty,
          qc_passed_qty, qc_rejected_qty, status, created_at,
          staff ( id, name, role ),
          order_items (
            id, name_item, qty, ready_for_sewing_at,
            orders ( id, order_id, customer_name ),
            products ( id, name, sewing_cost_per_pcs )
          ),
          qc_checks ( id, checked_at, passed_qty, rejected_qty, notes )
        `)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setAssignments((data as any[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat beban penjahit');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch piecework_tasks 'completed' yang belum paid (untuk panel susulan) ─
  const fetchPendingTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('piecework_tasks')
        .select(`
          id, staff_id, order_id, product_id, task_type, qty, rate_per_unit,
          total_wage, status, completed_at, sewing_assignment_id, created_at,
          staff ( id, name, role ),
          orders ( id, order_id, customer_name ),
          products ( id, name, sewing_cost_per_pcs )
        `)
        .eq('status', 'completed')
        .eq('task_type', 'sewing')
        .is('payroll_id', null)
        .order('completed_at', { ascending: false });

      if (err) throw err;
      setPendingTasks((data as any[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat tasks susulan');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Mark ready for sewing ─────────────────────────────────────────────────
  const markReadyForSewing = useCallback(async (orderItemIds: string[]) => {
    const { error: err } = await supabase.rpc('mark_ready_for_sewing', {
      p_order_item_ids: orderItemIds,
    });
    if (err) throw new Error(err.message);
    await fetchSewingPool();
  }, [fetchSewingPool]);

  // ── Distribusi kerja jahit ────────────────────────────────────────────────
  const distributeWork = useCallback(async (
    orderItemIds: string[] | null,
    notes: string | null
  ): Promise<string> => {
    const { data, error: err } = await supabase.rpc('distribute_sewing_work', {
      p_order_item_ids: orderItemIds ?? null,
      p_notes: notes ?? null,
    });
    if (err) throw new Error(err.message);
    await Promise.all([fetchSewingPool(), fetchAssignments()]);
    return data as string; // batch_id
  }, [fetchSewingPool, fetchAssignments]);

  // ── Catat QC check ───────────────────────────────────────────────────────
  const recordQcCheck = useCallback(async (
    assignmentId: string,
    passedQty: number,
    rejectedQty: number,
    notes: string | null
  ) => {
    const { error: err } = await supabase.rpc('record_qc_check', {
      p_assignment_id: assignmentId,
      p_passed_qty: passedQty,
      p_rejected_qty: rejectedQty,
      p_notes: notes ?? null,
    });
    if (err) throw new Error(err.message);
    await Promise.all([fetchAssignments(), fetchPendingTasks()]);
  }, [fetchAssignments, fetchPendingTasks]);

  // ── Tandai paid_manual (susulan cash) ────────────────────────────────────
  const markManualPaid = useCallback(async (
    taskIds: string[],
    note: string | null
  ) => {
    const { error: err } = await supabase.rpc('mark_sewing_manual_paid', {
      p_piecework_task_ids: taskIds,
      p_note: note ?? null,
    });
    if (err) throw new Error(err.message);
    await fetchPendingTasks();
  }, [fetchPendingTasks]);

  // ── Mulai pengerjaan jahit (assigned -> in_progress) ─────────────────────
  const startAssignment = useCallback(async (assignmentId: string) => {
    try {
      const { error: rpcErr } = await supabase.rpc('start_sewing_assignment', {
        p_assignment_id: assignmentId,
      });
      if (rpcErr) throw rpcErr;
    } catch {
      // Fallback ke direct update jika RPC belum termigrasi
      const { error: updateErr } = await supabase
        .from('sewing_assignments')
        .update({ status: 'in_progress' })
        .eq('id', assignmentId)
        .eq('status', 'assigned');
      if (updateErr) throw new Error(updateErr.message);
    }
    await fetchAssignments();
  }, [fetchAssignments]);

  // ── Mulai semua tugas jahit sekaligus (opsional per penjahit) ──────────────
  const startAllAssignments = useCallback(async (staffId?: string) => {
    try {
      const { error: rpcErr } = await supabase.rpc('start_all_sewing_assignments', {
        p_staff_id: staffId ?? null,
      });
      if (rpcErr) throw rpcErr;
    } catch {
      let query = supabase
        .from('sewing_assignments')
        .update({ status: 'in_progress' })
        .eq('status', 'assigned');
      if (staffId) {
        query = query.eq('staff_id', staffId);
      }
      const { error: updateErr } = await query;
      if (updateErr) throw new Error(updateErr.message);
    }
    await fetchAssignments();
  }, [fetchAssignments]);

  // ── Refetch all ──────────────────────────────────────────────────────────
  const refetchAll = useCallback(async () => {
    await Promise.all([fetchSewingPool(), fetchAssignments(), fetchPendingTasks()]);
  }, [fetchSewingPool, fetchAssignments, fetchPendingTasks]);

  return {
    sewingPool,
    assignments,
    batches,
    pendingTasks,
    loading,
    error,
    fetchSewingPool,
    fetchAssignments,
    fetchPendingTasks,
    markReadyForSewing,
    distributeWork,
    recordQcCheck,
    markManualPaid,
    startAssignment,
    startAllAssignments,
    refetchAll,
  };
}
