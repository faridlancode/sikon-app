import { useState, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Nota } from '../types';

export function useNotas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Mengambil atau membuat nota pesanan via RPC get_or_create_nota.
   * Hanya diizinkan untuk pesanan dengan status 'lunas'.
   * Mengembalikan nota lengkap dengan snapshot items & payments yang terkunci.
   */
  const getOrCreateNota = useCallback(
    async (orderId: string): Promise<Nota | null> => {
      try {
        setLoading(true);
        setError(null);

        // 1. Panggil RPC get_or_create_nota
        const { data: notaId, error: rpcErr } = await (supabase as any).rpc(
          'get_or_create_nota',
          {
            p_order_id: orderId,
          }
        );

        if (rpcErr) throw rpcErr;
        if (!notaId) throw new Error('ID nota tidak dikembalikan oleh server');

        // 2. Ambil baris data nota yang baru dibuat atau yang sudah ada
        const { data: notaData, error: fetchErr } = await (supabase as any)
          .from('notas')
          .select('*')
          .eq('id', notaId)
          .single();

        if (fetchErr) throw fetchErr;
        return notaData as Nota;
      } catch (err: any) {
        console.error('Error in getOrCreateNota:', err);
        setError(err.message || 'Gagal membuat/memuat nota pesanan');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Mengambil nota yang sudah ada untuk sebuah pesanan jika ada
   */
  const getNotaByOrderId = useCallback(
    async (orderId: string): Promise<Nota | null> => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: err } = await (supabase as any)
          .from('notas')
          .select('*')
          .eq('order_id', orderId)
          .maybeSingle();

        if (err) throw err;
        return data as Nota | null;
      } catch (err: any) {
        console.error('Error fetching nota by orderId:', err);
        setError(err.message || 'Gagal memuat nota pesanan');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    getOrCreateNota,
    getNotaByOrderId,
  };
}
