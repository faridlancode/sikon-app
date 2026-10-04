import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { SewingAssignment, CuttingAssignment, Material } from '../types';

export interface MaterialStockCheck {
  material_id: string;
  material_name: string;
  needed_qty: number;
  stock_qty: number;
  unit: string;
  is_sufficient: boolean;
  has_colors?: boolean;
  color_breakdown?: Array<{ color_name: string; stock_qty: number }>;
}

export interface AssignmentStockCheckResult {
  all_sufficient: boolean;
  assigned_qty: number;
  materials: MaterialStockCheck[];
}

export interface AssignmentWithBomStatus extends SewingAssignment {
  bomCheck?: AssignmentStockCheckResult | null;
  alreadyDispatched?: boolean;
}

export interface FabricStockCheck {
  material_id: string;
  material_color_id: string | null;
  material_name: string;
  color_name: string | null;
  needed_qty: number;
  stock_qty: number;
  unit: string;
  is_sufficient: boolean;
}

export interface CuttingStockCheckResult {
  all_sufficient: boolean;
  item_qty: number;
  fabrics: FabricStockCheck[];
}

export interface CuttingAssignmentWithFabricStatus extends CuttingAssignment {
  fabricCheck?: CuttingStockCheckResult | null;
  alreadyDispatched?: boolean;
}

export function useWarehouseDispatch() {
  const [pendingAssignments, setPendingAssignments] = useState<AssignmentWithBomStatus[]>([]);
  const [pendingCuttingAssignments, setPendingCuttingAssignments] = useState<CuttingAssignmentWithFabricStatus[]>([]);
  const [floorStockMaterials, setFloorStockMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch sewing assignments yang berstatus 'assigned' atau 'in_progress' untuk Gudang
  const fetchPendingAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('sewing_assignments')
        .select(`
          id, order_item_id, staff_id, batch_id, assigned_qty, sewn_qty,
          qc_passed_qty, qc_rejected_qty, applied_sewing_rate, status, created_at,
          material_dispatched_at, notes,
          staff ( id, name, role ),
          order_items (
            id, name_item, qty, product_id, ready_for_sewing_at,
            orders ( id, order_id, customer_name, order_type ),
            products ( id, name, sewing_cost_per_pcs )
          )
        `)
        .in('status', ['assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      if (err) throw err;

      // Cek apakah bahan sudah pernah diserahkan (material_dispatched_at != null atau ada stock_movement)
      const enriched: AssignmentWithBomStatus[] = ((data as any[]) ?? []).map((a: any) => ({
        ...a,
        alreadyDispatched: Boolean(a.material_dispatched_at),
      }));

      setPendingAssignments(enriched);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat penugasan jahit');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch cutting assignments aktif untuk pengeluaran kain di Gudang
  const fetchPendingCuttingAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('cutting_assignments')
        .select(`
          id, order_item_id, staff_id, assigned_at, status, notes,
          material_dispatched_at, dispatch_notes, force_started, force_reason,
          staff ( id, name, role ),
          order_items (
            id, order_id, product_id, name_item, qty, cutting_completed_at, cutting_qty,
            orders ( id, order_id, customer_name, production_status, total_price, order_date ),
            products ( id, name, cutting_cost_per_pcs ),
            order_item_fabrics (
              material_id, material_color_id, usage_qty_snapshot,
              materials ( name, unit, stock_qty ),
              material_colors ( color_name, stock_qty )
            )
          )
        `)
        .eq('status', 'assigned')
        .order('assigned_at', { ascending: true });

      if (err) throw err;

      const enriched: CuttingAssignmentWithFabricStatus[] = ((data as any[]) ?? []).map((a: any) => ({
        ...a,
        alreadyDispatched: Boolean(a.material_dispatched_at),
      }));

      setPendingCuttingAssignments(enriched);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat penugasan potong');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch material yang merupakan floor stock (benang, kancing finishing, jarum)
  const fetchFloorStockMaterials = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('materials')
        .select('id, name, unit, stock_qty, minimum_stock, is_floor_stock, is_active, material_categories(name, is_fabric)')
        .eq('is_floor_stock', true)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (err) throw err;
      setFloorStockMaterials((data as unknown as Material[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat material floor stock');
    }
  }, []);

  // Check stok kain untuk 1 cutting assignment
  const checkCuttingStock = useCallback(async (
    cuttingAssignmentId: string
  ): Promise<CuttingStockCheckResult | null> => {
    const { data, error: err } = await supabase.rpc('check_cutting_material_stock', {
      p_cutting_assignment_id: cuttingAssignmentId,
    });
    if (err) throw new Error(err.message);
    return data as CuttingStockCheckResult;
  }, []);

  // Serahkan kain ke tukang potong
  const dispatchCuttingMaterials = useCallback(async (
    cuttingAssignmentId: string,
    recordedByStaffId: string
  ): Promise<{ success: boolean; dispatched: any[] }> => {
    const { data, error: err } = await supabase.rpc('dispatch_cutting_materials', {
      p_cutting_assignment_id: cuttingAssignmentId,
      p_recorded_by: recordedByStaffId,
    });
    if (err) throw new Error(err.message);
    await fetchPendingCuttingAssignments();
    return data as { success: boolean; dispatched: any[] };
  }, [fetchPendingCuttingAssignments]);

  // Check stok bahan jahit untuk 1 assignment (preview sebelum serah)
  const checkAssignmentStock = useCallback(async (
    assignmentId: string
  ): Promise<AssignmentStockCheckResult | null> => {
    const { data, error: err } = await supabase.rpc('check_sewing_material_stock', {
      p_sewing_assignment_id: assignmentId,
    });
    if (err) throw new Error(err.message);
    return data as AssignmentStockCheckResult;
  }, []);

  // Serahkan bahan penjahit (dispatch Direct BOM)
  const dispatchSewingMaterials = useCallback(async (
    assignmentId: string,
    recordedByStaffId: string
  ): Promise<{ success: boolean; dispatched: any[] }> => {
    const { data, error: err } = await supabase.rpc('dispatch_sewing_materials', {
      p_sewing_assignment_id: assignmentId,
      p_recorded_by: recordedByStaffId,
    });
    if (err) throw new Error(err.message);
    await fetchPendingAssignments();
    return data as { success: boolean; dispatched: any[] };
  }, [fetchPendingAssignments]);

  // Keluarkan floor stock (benang, jarum, kancing finishing)
  const dispatchFloorStock = useCallback(async (payload: {
    material_id: string;
    material_color_id?: string | null;
    qty: number;
    unit: string;
    taken_by: string;
    recorded_by: string;
    notes?: string;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesi login tidak ditemukan.');

    const { data: movement, error: insertErr } = await supabase
      .from('stock_movements')
      .insert({
        user_id: user.id,
        material_id: payload.material_id,
        material_color_id: payload.material_color_id || null,
        movement_type: 'out',
        source_type: 'floor_stock',
        qty: payload.qty,
        unit: payload.unit,
        taken_by: payload.taken_by,
        recorded_by: payload.recorded_by,
        notes: payload.notes || 'Floor Stock — Operasional Gudang/Jahit/Finishing',
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    const { error: confirmErr } = await supabase.rpc('confirm_stock_movement', {
      p_movement_id: movement.id,
      p_taken_by: payload.taken_by,
      p_recorded_by: payload.recorded_by,
    });
    if (confirmErr) throw confirmErr;

    await fetchFloorStockMaterials();
  }, [fetchFloorStockMaterials]);

  const refetchAllDispatch = useCallback(async () => {
    await Promise.all([
      fetchPendingAssignments(),
      fetchPendingCuttingAssignments(),
      fetchFloorStockMaterials(),
    ]);
  }, [fetchPendingAssignments, fetchPendingCuttingAssignments, fetchFloorStockMaterials]);

  return {
    pendingAssignments,
    pendingCuttingAssignments,
    floorStockMaterials,
    loading,
    error,
    fetchPendingAssignments,
    fetchPendingCuttingAssignments,
    fetchFloorStockMaterials,
    checkCuttingStock,
    dispatchCuttingMaterials,
    checkAssignmentStock,
    dispatchSewingMaterials,
    dispatchFloorStock,
    refetchAllDispatch,
  };
}
