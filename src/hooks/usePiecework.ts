import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { PieceworkTask } from "../types";

export function usePiecework() {
  const [tasks, setTasks] = useState<PieceworkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("piecework_tasks")
      .select(`
        *,
        staff:staff_id (
          id,
          name,
          role,
          phone
        ),
        orders:order_id (
          id,
          order_id,
          customer_name
        ),
        products:product_id (
          id,
          name,
          cutting_cost_per_pcs,
          sewing_cost_per_pcs,
          sales_bonus_per_pcs
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setTasks((data ?? []) as PieceworkTask[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function createTask(payload: {
    staff_id: string;
    order_id?: string | null;
    product_id?: string | null;
    task_type: "cutting" | "sewing" | "finishing" | "other";
    qty: number;
    rate_per_unit: number;
    notes?: string | null;
    status?: "pending" | "completed" | "paid";
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const totalWage = Number(payload.qty) * Number(payload.rate_per_unit);

    const { data, error: insertError } = await supabase
      .from("piecework_tasks")
      .insert({
        user_id: user.id,
        staff_id: payload.staff_id,
        order_id: payload.order_id || null,
        product_id: payload.product_id || null,
        task_type: payload.task_type,
        qty: payload.qty,
        rate_per_unit: payload.rate_per_unit,
        total_wage: totalWage,
        notes: payload.notes?.trim() || null,
        status: payload.status || "completed",
        completed_at: payload.status === "pending" ? null : new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;
    await fetchTasks();
    return data;
  }

  async function updateTask(id: string, payload: Partial<PieceworkTask>) {
    const updates: any = { ...payload };
    if (payload.qty !== undefined && payload.rate_per_unit !== undefined) {
      updates.total_wage = Number(payload.qty) * Number(payload.rate_per_unit);
    }

    const { error: updateError } = await supabase
      .from("piecework_tasks")
      .update(updates)
      .eq("id", id);

    if (updateError) throw updateError;
    await fetchTasks();
  }

  async function updateTaskStatus(id: string, status: "pending" | "completed" | "paid") {
    const updates: any = { status };
    if (status === "completed") {
      updates.completed_at = new Date().toISOString();
    } else if (status === "paid") {
      updates.paid_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("piecework_tasks")
      .update(updates)
      .eq("id", id);

    if (updateError) throw updateError;
    await fetchTasks();
  }

  async function deleteTask(id: string) {
    const { error: deleteError } = await supabase
      .from("piecework_tasks")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    await fetchTasks();
  }

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const paidTasks = tasks.filter((t) => t.status === "paid");

  return {
    tasks,
    completedTasks,
    pendingTasks,
    paidTasks,
    loading,
    error,
    refetch: fetchTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
  };
}
