import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { SupplierPurchase, SupplierPurchaseItem } from "../types";

export function useSupplierPurchases() {
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("supplier_purchases")
      .select(`
        *,
        staff:requested_by (
          id,
          name,
          role
        ),
        supplier_purchase_items (
          id,
          purchase_id,
          stock_request_id,
          material_id,
          material_color_id,
          category_id,
          quantity,
          unit,
          unit_price,
          total_price,
          materials (
            id,
            name,
            unit
          ),
          material_colors (
            id,
            color_name
          ),
          transaction_categories (
            id,
            name
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPurchases((data ?? []) as SupplierPurchase[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  async function createPurchase(payload: {
    requested_by?: string | null;
    supplier_name: string;
    payment_date?: string;
    notes?: string | null;
    items: {
      material_id: string;
      material_color_id?: string | null;
      category_id: string;
      stock_request_id?: string | null;
      quantity: number;
      unit: string;
      unit_price: number;
    }[];
  }) {
    if (!payload.items || payload.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian.");
    }

    const jsonbItems = payload.items.map((i) => ({
      material_id: i.material_id,
      material_color_id: i.material_color_id || null,
      category_id: i.category_id,
      stock_request_id: i.stock_request_id || null,
      quantity: i.quantity,
      unit: i.unit,
      unit_price: i.unit_price,
    }));

    const { data, error } = await supabase.rpc("create_supplier_purchase", {
      p_requested_by: payload.requested_by || null,
      p_supplier_name: payload.supplier_name.trim(),
      p_payment_date: payload.payment_date || new Date().toISOString().split("T")[0],
      p_items: jsonbItems,
      p_notes: payload.notes || null,
    });

    if (error) throw error;

    // Link and update stock_requests to in_progress
    const linkedReqIds = payload.items
      .map((i) => i.stock_request_id)
      .filter((id): id is string => Boolean(id));

    if (linkedReqIds.length > 0 && data?.id) {
      await supabase
        .from("stock_requests")
        .update({
          status: "in_progress",
          fulfillment_type: "supplier_purchase",
          supplier_purchase_id: data.id,
        })
        .in("id", linkedReqIds);
    }

    await fetchPurchases();
    return data;
  }

  async function receivePurchase(purchaseId: string) {
    const { error } = await supabase.rpc("receive_supplier_purchase", {
      p_purchase_id: purchaseId,
    });

    if (error) throw error;
    await fetchPurchases();
  }

  const orderedPurchases = purchases.filter((p) => p.status === "ordered");
  const receivedPurchases = purchases.filter((p) => p.status === "received");

  return {
    purchases,
    orderedPurchases,
    receivedPurchases,
    loading,
    error,
    refetch: fetchPurchases,
    createPurchase,
    receivePurchase,
  };
}
