import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { StockRequest } from "../types";

export function useStockRequests() {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("stock_requests")
      .select(`
        *,
        staff:requested_by (
          id,
          name,
          role
        ),
        materials (
          id,
          name,
          unit,
          stock_qty,
          material_categories (
            name,
            is_fabric
          )
        ),
        material_colors (
          id,
          color_name,
          color_code
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setRequests((data ?? []) as StockRequest[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function createRequest(payload: {
    material_id: string;
    material_color_id?: string | null;
    requested_by?: string | null;
    quantity_needed: number;
    unit: string;
    reason?: string | null;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { error: insertError } = await supabase
      .from("stock_requests")
      .insert({
        user_id: user.id,
        material_id: payload.material_id,
        material_color_id: payload.material_color_id || null,
        requested_by: payload.requested_by || null,
        quantity_needed: payload.quantity_needed,
        unit: payload.unit,
        reason: payload.reason?.trim() || null,
        status: "pending",
      });

    if (insertError) throw insertError;
    await fetchRequests();
  }

  async function updateRequestStatus(
    id: string,
    status: "pending" | "in_progress" | "fulfilled" | "cancelled",
    fulfillmentType?: "spj" | "supplier_purchase" | null
  ) {
    const updatePayload: Record<string, any> = { status };
    if (fulfillmentType !== undefined) {
      updatePayload.fulfillment_type = fulfillmentType;
    }
    if (status === "fulfilled") {
      updatePayload.fulfilled_date = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("stock_requests")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) throw updateError;
    await fetchRequests();
  }

  async function deleteRequest(id: string) {
    const { error: deleteError } = await supabase
      .from("stock_requests")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    await fetchRequests();
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");

  return {
    requests,
    pendingRequests,
    loading,
    error,
    refetch: fetchRequests,
    createRequest,
    updateRequestStatus,
    deleteRequest,
  };
}
