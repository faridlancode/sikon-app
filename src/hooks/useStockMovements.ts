import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { StockMovement } from "../types";

export function useStockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("stock_movements")
      .select(`
        *,
        taken_by_staff:taken_by (
          id,
          name,
          role
        ),
        recorded_by_staff:recorded_by (
          id,
          name,
          role
        ),
        materials (
          id,
          name,
          unit,
          stock_qty,
          minimum_stock,
          category_id,
          material_categories (
            name,
            is_fabric
          )
        ),
        material_colors (
          id,
          color_name,
          color_code,
          stock_qty,
          minimum_stock
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setMovements((data ?? []) as StockMovement[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  async function confirmMovement(
    movementId: string,
    takenBy?: string | null,
    recordedBy?: string | null
  ) {
    const { error } = await supabase.rpc("confirm_stock_movement", {
      p_movement_id: movementId,
      p_taken_by: takenBy || null,
      p_recorded_by: recordedBy || null,
    });
    if (error) throw error;
    await fetchMovements();
  }

  async function cancelMovement(movementId: string) {
    const { error } = await supabase.rpc("cancel_stock_movement", {
      p_movement_id: movementId,
    });
    if (error) throw error;
    await fetchMovements();
  }

  async function adjustStock(payload: {
    material_id: string;
    material_color_id?: string | null;
    new_qty: number;
    unit: string;
    notes?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { data: movement, error: insertError } = await supabase
      .from("stock_movements")
      .insert({
        user_id: user.id,
        material_id: payload.material_id,
        material_color_id: payload.material_color_id || null,
        movement_type: "adjustment",
        source_type: "manual",
        qty: payload.new_qty,
        unit: payload.unit,
        notes: payload.notes || "Penyesuaian stok manual",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const { error: confirmError } = await supabase.rpc("confirm_stock_movement", {
      p_movement_id: movement.id,
    });

    if (confirmError) throw confirmError;
    await fetchMovements();
  }

  async function addManualMovement(payload: {
    material_id: string;
    material_color_id?: string | null;
    movement_type: "in" | "out";
    qty: number;
    unit: string;
    notes?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { data: movement, error: insertError } = await supabase
      .from("stock_movements")
      .insert({
        user_id: user.id,
        material_id: payload.material_id,
        material_color_id: payload.material_color_id || null,
        movement_type: payload.movement_type,
        source_type: "manual",
        qty: payload.qty,
        unit: payload.unit,
        notes: payload.notes || "Mutasi manual",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const { error: confirmError } = await supabase.rpc("confirm_stock_movement", {
      p_movement_id: movement.id,
    });

    if (confirmError) throw confirmError;
    await fetchMovements();
  }

  async function updateMinimumStock(params: {
    material_id: string;
    material_color_id?: string | null;
    minimum_stock: number;
  }) {
    if (params.material_color_id) {
      const { error } = await supabase
        .from("material_colors")
        .update({ minimum_stock: params.minimum_stock })
        .eq("id", params.material_color_id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("materials")
        .update({ minimum_stock: params.minimum_stock })
        .eq("id", params.material_id);
      if (error) throw error;
    }
    await fetchMovements();
  }

  const pendingMovements = movements.filter((m) => m.status === "pending");
  const confirmedMovements = movements.filter((m) => m.status === "confirmed");

  return {
    movements,
    pendingMovements,
    confirmedMovements,
    loading,
    error,
    refetch: fetchMovements,
    confirmMovement,
    cancelMovement,
    adjustStock,
    addManualMovement,
    updateMinimumStock,
  };
}
