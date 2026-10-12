import { useState, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import type {
  FixedAssetRegisterItem,
  FixedAssetDepreciationHistory,
  FixedAssetClass,
} from '../types';

export function useFixedAssets() {
  const [register, setRegister] = useState<FixedAssetRegisterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegister = useCallback(async (asOf?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase as any).rpc(
        'get_fixed_asset_register',
        asOf ? { p_as_of: asOf } : {}
      );
      if (err) throw err;
      setRegister((data as FixedAssetRegisterItem[]) || []);
    } catch (e: any) {
      console.error('Error fetching fixed asset register:', e);
      setError(e.message || 'Gagal memuat register aset tetap.');
    } finally {
      setLoading(false);
    }
  }, []);

  const registerFixedAsset = useCallback(
    async (payload: {
      name: string;
      assetClass: FixedAssetClass;
      acquisitionDate: string;
      cost: number;
      usefulLifeMonths: number;
      salvageValue?: number;
      paymentMethod?: string | null;
      accumulatedAtStart?: number;
      notes?: string | null;
    }) => {
      setError(null);
      const { data, error: err } = await (supabase as any).rpc(
        'register_fixed_asset',
        {
          p_name: payload.name.trim(),
          p_asset_class: payload.assetClass,
          p_acquisition_date: payload.acquisitionDate,
          p_cost: payload.cost,
          p_useful_life_months: payload.usefulLifeMonths,
          p_salvage_value: payload.salvageValue ?? 0,
          p_payment_method: payload.paymentMethod || null,
          p_accumulated_at_start: payload.accumulatedAtStart ?? 0,
          p_notes: payload.notes?.trim() || null,
        }
      );
      if (err) throw new Error(err.message);
      await fetchRegister();
      return data as string;
    },
    [fetchRegister]
  );

  const disposeFixedAsset = useCallback(
    async (payload: {
      assetId: string;
      date: string;
      proceeds?: number;
      paymentMethod?: string | null;
    }) => {
      setError(null);
      const { data, error: err } = await (supabase as any).rpc(
        'dispose_fixed_asset',
        {
          p_asset_id: payload.assetId,
          p_date: payload.date,
          p_proceeds: payload.proceeds ?? 0,
          p_payment_method: payload.paymentMethod || null,
        }
      );
      if (err) throw new Error(err.message);
      await fetchRegister();
      return data as string;
    },
    [fetchRegister]
  );

  const undoDisposeFixedAsset = useCallback(
    async (assetId: string) => {
      setError(null);
      const { data, error: err } = await (supabase as any).rpc(
        'undo_dispose_fixed_asset',
        { p_asset_id: assetId }
      );
      if (err) throw new Error(err.message);
      await fetchRegister();
      return data as boolean;
    },
    [fetchRegister]
  );

  const deleteFixedAsset = useCallback(
    async (assetId: string) => {
      setError(null);
      const { data, error: err } = await (supabase as any).rpc(
        'delete_fixed_asset',
        { p_asset_id: assetId }
      );
      if (err) throw new Error(err.message);
      await fetchRegister();
      return data as boolean;
    },
    [fetchRegister]
  );

  const fetchDepreciationHistory = useCallback(
    async (assetId: string): Promise<FixedAssetDepreciationHistory[]> => {
      try {
        const { data, error: err } = await (supabase as any)
          .from('fixed_asset_depreciations')
          .select(`
            id,
            period,
            amount,
            journal_entry_id,
            created_at,
            journal_entries (
              entry_no,
              entry_date
            )
          `)
          .eq('asset_id', assetId)
          .order('period', { ascending: false });

        if (err) throw err;

        return ((data || []) as any[]).map((row) => ({
          id: row.id,
          period: row.period,
          amount: Number(row.amount),
          journal_entry_id: row.journal_entry_id,
          entry_no: row.journal_entries?.entry_no,
          entry_date: row.journal_entries?.entry_date,
          created_at: row.created_at,
        }));
      } catch (e: any) {
        console.error('Error fetching asset depreciation history:', e);
        throw new Error(e.message || 'Gagal memuat riwayat penyusutan.');
      }
    },
    []
  );

  return {
    register,
    loading,
    error,
    fetchRegister,
    registerFixedAsset,
    disposeFixedAsset,
    undoDisposeFixedAsset,
    deleteFixedAsset,
    fetchDepreciationHistory,
  };
}
