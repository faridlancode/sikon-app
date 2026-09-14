import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
      .from('orders_with_balance')
      .select('*')
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setOrders(data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /** Buat order baru sekaligus item-itemnya. */
  async function createOrder({ order, items }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({ ...order, user_id: user.id })
      .select()
      .single();
    if (orderError) throw orderError;

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map((item) => ({ ...item, order_id: newOrder.id, user_id: user.id }))
      );
      if (itemsError) throw itemsError;
    }

    await fetchOrders();
    return newOrder;
  }

  /** Update data order + ganti seluruh daftar item (hapus lalu insert ulang, cara paling aman untuk edit). */
  async function updateOrder(orderId, { order, items }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: orderError } = await supabase.from('orders').update(order).eq('id', orderId);
    if (orderError) throw orderError;

    const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', orderId);
    if (deleteError) throw deleteError;

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map((item) => ({ ...item, order_id: orderId, user_id: user.id }))
      );
      if (itemsError) throw itemsError;
    }

    await fetchOrders();
  }

  /** Hapus order (item & riwayat pembayaran ikut terhapus via ON DELETE CASCADE). */
  async function deleteOrder(orderId) {
    const { error: deleteError } = await supabase.from('orders').delete().eq('id', orderId);
    if (deleteError) throw deleteError;
    await fetchOrders();
  }

  /** Ambil detail lengkap 1 order: item-item & riwayat pembayaran. */
  async function fetchOrderDetail(orderId) {
    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('order_payments').select('*').eq('order_id', orderId).order('payment_date', { ascending: true }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    return { items: itemsRes.data ?? [], payments: paymentsRes.data ?? [] };
  }

  /** Catat pembayaran (DP / Pelunasan) — otomatis membuat entri di Financial sebagai pemasukan. */
  async function recordPayment(orderId, { amount, paymentType, paymentDate, paymentMethod }) {
    const { data, error: rpcError } = await supabase.rpc('record_order_payment', {
      p_order_id: orderId,
      p_amount: amount,
      p_payment_type: paymentType,
      p_payment_date: paymentDate,
      p_payment_method: paymentMethod || null,
    });
    if (rpcError) throw rpcError;
    await fetchOrders();
    return data;
  }

  /** Hapus pembayaran — otomatis menghapus entri pemasukan terkait di Financial. */
  async function deletePayment(paymentId) {
    const { error: rpcError } = await supabase.rpc('delete_order_payment', { p_payment_id: paymentId });
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
  };
}
