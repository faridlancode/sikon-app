import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { CuttingAssignment, CuttingWeeklyReport } from '../types';

export interface CuttingReportLine {
  order_id: string;
  reported_qty: number;
  notes?: string;
}

export function useCuttingWorklog() {
  const [cuttingAssignments, setCuttingAssignments] = useState<CuttingAssignment[]>([]);
  const [unassignedOrders, setUnassignedOrders] = useState<any[]>([]);
  const [cuttingReports, setCuttingReports] = useState<CuttingWeeklyReport[]>([]);
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
          id, order_id, staff_id, assigned_at, status, notes,
          staff ( id, name, role ),
          orders (
            id, order_id, customer_name, production_status, total_price,
            order_items ( id, qty, name_item, products ( name, cutting_cost_per_pcs ) )
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

  // ── Fetch orders yang belum di-assign ke tukang potong ───────────────────
  const fetchUnassignedOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Orders yang belum ada di cutting_assignments
      const { data: assignedOrderIds } = await supabase
        .from('cutting_assignments')
        .select('order_id');

      const assignedIds = (assignedOrderIds ?? []).map((r: any) => r.order_id);

      let query = supabase
        .from('orders')
        .select(`
          id, order_id, customer_name, production_status, total_price, order_date,
          order_items ( id, qty, name_item, products ( name, cutting_cost_per_pcs ) )
        `)
        .in('production_status', ['production', 'ready'])
        .order('order_date', { ascending: true });

      if (assignedIds.length > 0) {
        query = query.not('id', 'in', `(${assignedIds.join(',')})`);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setUnassignedOrders((data as any[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat order yang belum di-assign');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch cutting weekly reports ──────────────────────────────────────────
  const fetchCuttingReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('cutting_weekly_reports')
        .select(`
          id, staff_id, period_start, period_end, report_date, total_qty, status, notes, created_at,
          staff ( id, name, role ),
          cutting_report_lines (
            id, order_id, reported_qty, expected_qty, notes,
            orders ( id, order_id, customer_name )
          )
        `)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setCuttingReports((data as any[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat laporan potong');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Assign order ke tukang potong ─────────────────────────────────────────
  const assignCuttingOrder = useCallback(async (
    orderId: string,
    staffId: string,
    notes: string | null
  ) => {
    const { error: err } = await supabase.rpc('assign_cutting_order', {
      p_order_id: orderId,
      p_staff_id: staffId,
      p_notes: notes ?? null,
    });
    if (err) throw new Error(err.message);
    await Promise.all([fetchCuttingAssignments(), fetchUnassignedOrders()]);
  }, [fetchCuttingAssignments, fetchUnassignedOrders]);

  // ── Submit laporan potong mingguan ────────────────────────────────────────
  const submitCuttingReport = useCallback(async (
    staffId: string,
    periodStart: string,
    periodEnd: string,
    lines: CuttingReportLine[],
    notes: string | null
  ): Promise<{ report_id: string; total_qty: number; warnings: any[] }> => {
    const { data, error: err } = await supabase.rpc('submit_cutting_report', {
      p_staff_id: staffId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_lines: lines,
      p_notes: notes ?? null,
    });
    if (err) throw new Error(err.message);
    await Promise.all([fetchCuttingAssignments(), fetchCuttingReports()]);
    return data as { report_id: string; total_qty: number; warnings: any[] };
  }, [fetchCuttingAssignments, fetchCuttingReports]);

  // ── Refetch all ──────────────────────────────────────────────────────────
  const refetchAll = useCallback(async () => {
    await Promise.all([
      fetchCuttingAssignments(),
      fetchUnassignedOrders(),
      fetchCuttingReports(),
    ]);
  }, [fetchCuttingAssignments, fetchUnassignedOrders, fetchCuttingReports]);

  return {
    cuttingAssignments,
    unassignedOrders,
    cuttingReports,
    loading,
    error,
    fetchCuttingAssignments,
    fetchUnassignedOrders,
    fetchCuttingReports,
    assignCuttingOrder,
    submitCuttingReport,
    refetchAll,
  };
}
