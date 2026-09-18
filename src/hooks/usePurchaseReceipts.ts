import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { PurchaseReceipt, PurchaseReceiptItem } from "../types";

export interface CreateReceiptPayload {
  supplier_name?: string | null;
  notes?: string | null;
  received_date: string;
  items: {
    material_id: string;
    material_color_id?: string | null;
    qty: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }[];
}

export function usePurchaseReceipts() {
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("purchase_receipts")
      .select(`
        *,
        purchase_receipt_items (
          *,
          materials (id, name, unit),
          material_colors (id, color_name)
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setReceipts((data ?? []) as PurchaseReceipt[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  async function createReceipt(payload: CreateReceiptPayload) {
    if (!payload.items || payload.items.length === 0) {
      throw new Error("Penerimaan barang harus memiliki minimal 1 item material.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const totalAmount = payload.items.reduce(
      (sum, item) => sum + (Number(item.total_price) || 0),
      0
    );

    // 1. Insert header purchase_receipts
    const { data: receipt, error: receiptError } = await supabase
      .from("purchase_receipts")
      .insert({
        user_id: user.id,
        supplier_name: payload.supplier_name?.trim() || null,
        total_amount: totalAmount,
        notes: payload.notes?.trim() || null,
        received_date: payload.received_date,
        status: "unpaid",
      })
      .select("id")
      .single();

    if (receiptError) throw receiptError;

    // 2. Untuk setiap item: buat stock_movement (in) -> confirm RPC -> buat purchase_receipt_items
    for (const item of payload.items) {
      // Buat stock movement 'in'
      const { data: movement, error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          user_id: user.id,
          material_id: item.material_id,
          material_color_id: item.material_color_id || null,
          movement_type: "in",
          source_type: "purchase",
          source_id: receipt.id,
          qty: item.qty,
          unit: item.unit,
          notes: `Penerimaan dari ${payload.supplier_name?.trim() || "Supplier"}`,
          status: "pending",
        })
        .select("id")
        .single();

      if (movementError) throw movementError;

      // Langsung konfirmasi via RPC agar stok otomatis bertambah
      const { error: confirmError } = await supabase.rpc("confirm_stock_movement", {
        p_movement_id: movement.id,
      });

      if (confirmError) throw confirmError;

      // Insert item detail
      const { error: itemError } = await supabase
        .from("purchase_receipt_items")
        .insert({
          user_id: user.id,
          purchase_receipt_id: receipt.id,
          stock_movement_id: movement.id,
          material_id: item.material_id,
          material_color_id: item.material_color_id || null,
          qty: item.qty,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
        });

      if (itemError) throw itemError;
    }

    await fetchReceipts();
    return receipt;
  }

  async function payReceipt(receiptId: string, paymentDate: string, paymentMethod?: string) {
    const { error: payError } = await supabase.rpc("pay_purchase_receipt", {
      p_receipt_id: receiptId,
      p_payment_date: paymentDate,
      p_payment_method: paymentMethod || null,
    });

    if (payError) throw payError;
    await fetchReceipts();
  }

  const unpaidReceipts = receipts.filter((r) => r.status === "unpaid");
  const paidReceipts = receipts.filter((r) => r.status === "paid");

  return {
    receipts,
    unpaidReceipts,
    paidReceipts,
    loading,
    error,
    refetch: fetchReceipts,
    createReceipt,
    payReceipt,
  };
}
