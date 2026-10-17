import { useState, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Receipt } from '../types';

export function useReceipts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Mengambil data kwitansi berdasarkan payment_id (READ ONLY).
   * Kwitansi dibuat secara otomatis di database via trigger AFTER INSERT pada order_payments.
   */
  const getReceiptByPaymentId = useCallback(
    async (paymentId: string): Promise<Receipt | null> => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: err } = await (supabase as any)
          .from('receipts')
          .select('*')
          .eq('payment_id', paymentId)
          .maybeSingle();

        if (err) throw err;
        return data as Receipt | null;
      } catch (err: any) {
        console.error('Error fetching receipt by paymentId:', err);
        setError(err.message || 'Gagal memuat kwitansi');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Mengambil seluruh kwitansi untuk sebuah pesanan (order_id)
   */
  const getReceiptsByOrderId = useCallback(
    async (orderId: string): Promise<Receipt[]> => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: err } = await (supabase as any)
          .from('receipts')
          .select('*')
          .eq('order_id', orderId)
          .order('receipt_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (err) throw err;
        return (data || []) as Receipt[];
      } catch (err: any) {
        console.error('Error fetching receipts by orderId:', err);
        setError(err.message || 'Gagal memuat daftar kwitansi');
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    getReceiptByPaymentId,
    getReceiptsByOrderId,
  };
}
