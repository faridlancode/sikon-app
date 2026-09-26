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
        approved_by_staff:approved_by (
          id,
          name,
          role
        ),
        orders:source_order_id (
          id,
          order_id,
          customer_name
        ),
        order_items:source_order_item_id (
          id,
          name_item,
          qty
        ),
        materials (
          id,
          name,
          unit,
          price,
          stock_qty,
          material_categories (
            name,
            is_fabric
          )
        ),
        material_colors (
          id,
          color_name,
          color_code,
          stock_qty
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
    fulfillment_type?: "spj" | "supplier_purchase";
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
        fulfillment_type: payload.fulfillment_type || "spj",
        source_type: "manual",
      });

    if (insertError) throw insertError;
    await fetchRequests();
  }

  async function approveRequest(requestId: string, approvedByStaffId?: string) {
    const { error: rpcError } = await supabase.rpc("approve_stock_request", {
      p_request_id: requestId,
      p_approved_by: approvedByStaffId || null,
    });
    if (rpcError) throw rpcError;
    await fetchRequests();
  }

  async function rejectRequest(requestId: string, reason: string) {
    const { error: rpcError } = await supabase.rpc("reject_stock_request", {
      p_request_id: requestId,
      p_reason: reason,
    });
    if (rpcError) throw rpcError;
    await fetchRequests();
  }

  async function confirmDraftAutoRequest(
    requestId: string,
    payload: {
      requested_by: string;
      quantity_needed?: number;
      reason?: string | null;
      fulfillment_type?: "spj" | "supplier_purchase";
    }
  ) {
    const updatePayload: Record<string, any> = {
      status: "pending",
      requested_by: payload.requested_by,
      requested_date: new Date().toISOString().split("T")[0],
    };
    if (payload.quantity_needed !== undefined && payload.quantity_needed > 0) {
      updatePayload.quantity_needed = payload.quantity_needed;
    }
    if (payload.reason !== undefined) {
      updatePayload.reason = payload.reason;
    }
    if (payload.fulfillment_type) {
      updatePayload.fulfillment_type = payload.fulfillment_type;
    }

    const { error: updateError } = await supabase
      .from("stock_requests")
      .update(updatePayload)
      .eq("id", requestId);

    if (updateError) throw updateError;
    await fetchRequests();
  }

  async function updateRequestFulfillmentType(
    requestId: string,
    fulfillmentType: "spj" | "supplier_purchase"
  ) {
    const { error: updateError } = await supabase
      .from("stock_requests")
      .update({ fulfillment_type: fulfillmentType })
      .eq("id", requestId);

    if (updateError) throw updateError;
    await fetchRequests();
  }

  async function updateRequestStatus(
    id: string,
    status: StockRequest["status"],
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

  const draftAutoRequests = requests.filter((r) => r.status === "draft_auto");
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const approvedRequests = requests.filter((r) => r.status === "approved");

  return {
    requests,
    draftAutoRequests,
    pendingRequests,
    approvedRequests,
    loading,
    error,
    refetch: fetchRequests,
    createRequest,
    approveRequest,
    rejectRequest,
    confirmDraftAutoRequest,
    updateRequestFulfillmentType,
    updateRequestStatus,
    deleteRequest,
  };
}
