import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Mengelola daftar order berikut status pembayarannya (dari view orders_with_balance).
 * Detail item & riwayat pembayaran per-order di-fetch on-demand (lihat fetchOrderDetail).
 */
export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("orders_with_balance")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      const orderIds = (data ?? []).map((order) => order.id).filter(Boolean);
      const { data: itemRows, error: itemsError } = orderIds.length
        ? await supabase
            .from("order_items")
            .select("order_id, qty, category_id, product_categories(name)")
            .in("order_id", orderIds)
        : { data: [], error: null };

      if (itemsError) {
        setError(itemsError.message);
        setOrders(data ?? []);
      } else {
        const quantities = (itemRows ?? []).reduce((totals, item) => {
          totals[item.order_id] =
            (totals[item.order_id] || 0) + Number(item.qty || 0);
          return totals;
        }, {});
        const categoryQuantities = (itemRows ?? []).reduce((totals, item) => {
          const relatedCategory = Array.isArray(item.product_categories)
            ? item.product_categories[0]
            : item.product_categories;
          const categoryName = relatedCategory?.name || "Tanpa Kategori";
          if (!totals[item.order_id]) totals[item.order_id] = {};
          totals[item.order_id][categoryName] =
            (totals[item.order_id][categoryName] || 0) + Number(item.qty || 0);
          return totals;
        }, {});
        setOrders(
          (data ?? []).map((order) => ({
            ...order,
            total_qty: quantities[order.id] || 0,
            category_qty: categoryQuantities[order.id] || {},
          })),
        );
        setError(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /** Helper untuk insert order items beserta rincian pilihan kain (order_item_fabrics) */
  async function insertOrderItemsWithFabrics(orderId, items, userId) {
    for (const item of items) {
      const { fabricSelections, bomMaterials, ...itemData } = item;
      const { data: insertedItem, error: itemError } = await supabase
        .from("order_items")
        .insert({
          ...itemData,
          order_id: orderId,
          user_id: userId,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      if (fabricSelections && fabricSelections.length > 0) {
        const fabricRows = fabricSelections.map((sel) => ({
          user_id: userId,
          order_item_id: insertedItem.id,
          product_fabric_slot_id: sel.slotId || null,
          material_id: sel.materialId,
          material_color_id: sel.materialColorId || null,
          usage_qty_snapshot: Number(sel.usageQty) || 0,
          price_snapshot: Number(sel.price) || 0,
          line_cost_snapshot:
            Number(sel.lineCost) ||
            (Number(sel.price) || 0) * (Number(sel.usageQty) || 0),
        }));

        const { error: fabricsError } = await supabase
          .from("order_item_fabrics")
          .insert(fabricRows);

        if (fabricsError) throw fabricsError;
      }
    }
  }

  async function generateOrderStockMovements(
    orderId: string | number,
    orderIdentifier: { order_id?: string | number; customer_name?: string | null },
    items: any[],
    userId: string
  ) {
    try {
      const stockMovementRows: any[] = [];
      for (const item of items) {
        const itemQty = Number(item.qty) || 1;
        const itemName = item.name_item || item.product_name || "Produk";

        // 1. Kain (per slot dan per warna yang dipilih)
        if (item.fabricSelections && item.fabricSelections.length > 0) {
          for (const sel of item.fabricSelections) {
            if (!sel.materialId) continue;
            const totalUsage = (Number(sel.usageQty) || 0) * itemQty;
            if (totalUsage <= 0) continue;
            stockMovementRows.push({
              user_id: userId,
              material_id: sel.materialId,
              material_color_id: sel.materialColorId || null,
              movement_type: "out",
              source_type: "order_consumption",
              source_id: orderId,
              qty: totalUsage,
              unit: sel.unit || "meter",
              notes: `Order #${orderIdentifier.order_id || ""} (${orderIdentifier.customer_name || "Customer"}) — ${itemName} (${itemQty} pcs) [${sel.slotLabel || "Kain"}]`,
              status: "pending",
            });
          }
        }

        // 2. Aksesoris / BOM non-kain
        if (item.bomMaterials && item.bomMaterials.length > 0) {
          for (const bom of item.bomMaterials) {
            if (!bom.material_id) continue;
            const totalUsage = (Number(bom.quantity) || 0) * itemQty;
            if (totalUsage <= 0) continue;
            stockMovementRows.push({
              user_id: userId,
              material_id: bom.material_id,
              material_color_id: null,
              movement_type: "out",
              source_type: "order_consumption",
              source_id: orderId,
              qty: totalUsage,
              unit: bom.unit || "pcs",
              notes: `Order #${orderIdentifier.order_id || ""} (${orderIdentifier.customer_name || "Customer"}) — ${itemName} (${itemQty} pcs)`,
              status: "pending",
            });
          }
        }
      }

      if (stockMovementRows.length > 0) {
        const { error: smError } = await supabase
          .from("stock_movements")
          .insert(stockMovementRows);
        if (smError) {
          console.error("Gagal auto-generate stock movements:", smError);
        }
      }
    } catch (err) {
      console.error("Error saat auto-generate stock movements:", err);
    }
  }

  /** Buat order baru sekaligus item-itemnya & rincian kain. */
  async function createOrder({ order, items }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({ ...order, user_id: user.id, production_status: 'production' })
      .select()
      .single();
    if (orderError) throw orderError;

    if (items.length > 0) {
      await insertOrderItemsWithFabrics(newOrder.id, items, user.id);

      // Auto-generate pending stock requests untuk staf gudang
      await generateOrderStockMovements(
        newOrder.id,
        {
          order_id: newOrder.order_id,
          customer_name: newOrder.customer_name,
        },
        items,
        user.id
      );
    }

    await fetchOrders();
    return newOrder;
  }

  /** Update data order + ganti seluruh daftar item & kain. */
  async function updateOrder(orderId, { order, items }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Batalkan pending stock movements lama terkait order ini
    await supabase
      .from("stock_movements")
      .update({ status: "cancelled" })
      .eq("source_id", orderId)
      .eq("status", "pending");

    const { data: updatedOrder, error: orderError } = await supabase
      .from("orders")
      .update(order)
      .eq("id", orderId)
      .select()
      .single();
    if (orderError) throw orderError;

    // Menghapus order_items akan cascade menghapus order_item_fabrics
    const { error: deleteError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId);
    if (deleteError) throw deleteError;

    if (items.length > 0) {
      await insertOrderItemsWithFabrics(orderId, items, user.id);
      await generateOrderStockMovements(
        orderId,
        {
          order_id: updatedOrder?.order_id || order.order_id,
          customer_name: updatedOrder?.customer_name || order.customer_name,
        },
        items,
        user.id
      );
    }

    await fetchOrders();
  }

  /** Hapus order (item & riwayat pembayaran ikut terhapus via ON DELETE CASCADE). */
  async function deleteOrder(orderId) {
    // Batalkan pending stock movements terkait order ini
    await supabase
      .from("stock_movements")
      .update({ status: "cancelled" })
      .eq("source_id", orderId)
      .eq("status", "pending");

    const { error: deleteError } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (deleteError) throw deleteError;
    await fetchOrders();
  }

  /** Ubah production_status order. Hanya transisi yang diizinkan: production→ready, ready→completed. */
  async function updateProductionStatus(orderId: string, newStatus: 'ready' | 'completed') {
    const { error: updateError } = await supabase
      .from("orders")
      .update({ production_status: newStatus })
      .eq("id", orderId);
    if (updateError) throw updateError;
    await fetchOrders();
  }

  /**
   * Tandai order-order yang sudah masuk hitungan bonus payroll sebagai bonus_paid = true.
   * Dipanggil setelah payroll sales berhasil dibayar, supaya order tersebut tidak
   * dihitung dua kali di periode berikutnya.
   */
  async function markOrderBonusPaid(orderIds: string[]) {
    if (!orderIds.length) return;
    const { error: updateError } = await supabase
      .from("orders")
      .update({ bonus_paid: true })
      .in("id", orderIds);
    if (updateError) {
      console.error("Gagal menandai bonus_paid pada orders:", updateError);
    }
    await fetchOrders();
  }

  /** Ambil detail lengkap 1 order: item-item (dengan kain & HPP snapshot) & riwayat pembayaran. */
  async function fetchOrderDetail(orderId) {
    const [itemsRes, paymentsRes] = await Promise.all([
      supabase
        .from("order_items")
        .select(
          "*, products(id, name, category_id, product_categories(name)), order_item_fabrics(*, materials(name, unit), material_colors(color_name))"
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("order_payments")
        .select("*")
        .eq("order_id", orderId)
        .order("payment_date", { ascending: true }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    return { items: itemsRes.data ?? [], payments: paymentsRes.data ?? [] };
  }

  /** Catat pembayaran (DP / Pelunasan) — otomatis membuat entri di Financial sebagai pemasukan. */
  async function recordPayment(
    orderId,
    { amount, paymentType, paymentDate, paymentMethod },
  ) {
    const { data, error: rpcError } = await supabase.rpc(
      "record_order_payment",
      {
        p_order_id: orderId,
        p_amount: amount,
        p_payment_type: paymentType,
        p_payment_date: paymentDate,
        p_payment_method: paymentMethod || null,
      },
    );
    if (rpcError) throw rpcError;
    await fetchOrders();
    return data;
  }

  /** Hapus pembayaran — otomatis menghapus entri pemasukan terkait di Financial. */
  async function deletePayment(paymentId) {
    const { error: rpcError } = await supabase.rpc("delete_order_payment", {
      p_payment_id: paymentId,
    });
    if (rpcError) throw rpcError;
    await fetchOrders();
  }

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    fetchOrderDetail,
    recordPayment,
    deletePayment,
    updateProductionStatus,
    markOrderBonusPaid,
  };
}
