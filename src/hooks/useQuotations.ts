import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Quotation, QuotationItem, QuotationStatus } from '../types';

export interface QuotationFilters {
  search?: string;
  status?: string;
  salesId?: string;
  startDate?: string;
  endDate?: string;
}

export function useQuotations() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotations = useCallback(async (filters?: QuotationFilters) => {
    try {
      setLoading(true);
      setError(null);

      let query = (supabase as any)
        .from('quotations')
        .select(`
          id,
          user_id,
          quotation_no,
          quotation_date,
          valid_until,
          customer_name,
          customer_company,
          customer_address,
          sales_id,
          dp_percent,
          payment_terms,
          lead_time,
          bank_account_id,
          notes,
          status,
          order_id,
          created_at,
          updated_at,
          sales:sales_id ( id, name, phone ),
          bank_account:bank_account_id ( id, bank_name, account_number, account_holder_name ),
          quotation_items (
            id,
            quotation_id,
            sort_order,
            category_id,
            product_id,
            material_id,
            material_color_id,
            product_name,
            fabric_type,
            fabric_color,
            fabric_specs,
            sewing_notes,
            embroidery_notes,
            print_notes,
            size_breakdown,
            qty,
            unit,
            unit_price,
            subtotal,
            item_notes,
            material:material_id (
              id,
              name,
              brand,
              composition,
              care_instruction,
              description
            )
          )
        `)
        .order('quotation_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.salesId && filters.salesId !== 'all') {
        query = query.eq('sales_id', filters.salesId);
      }
      if (filters?.startDate) {
        query = query.gte('quotation_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('quotation_date', filters.endDate);
      }
      if (filters?.search) {
        query = query.or(
          `quotation_no.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,customer_company.ilike.%${filters.search}%`
        );
      }

      const { data, error: err } = await query;
      if (err) throw err;

      // Urutkan item berdasarkan sort_order
      const formatted: Quotation[] = (data || []).map((q: any) => ({
        ...q,
        quotation_items: (q.quotation_items || []).sort(
          (a: QuotationItem, b: QuotationItem) => (a.sort_order || 0) - (b.sort_order || 0)
        ),
      }));

      setQuotations(formatted);
    } catch (err: any) {
      console.error('Error fetching quotations:', err);
      setError(err.message || 'Gagal memuat surat penawaran');
    } finally {
      setLoading(false);
    }
  }, []);

  const getQuotationDetail = useCallback(async (id: string): Promise<Quotation | null> => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('quotations')
        .select(`
          id,
          user_id,
          quotation_no,
          quotation_date,
          valid_until,
          customer_name,
          customer_company,
          customer_address,
          sales_id,
          dp_percent,
          payment_terms,
          lead_time,
          bank_account_id,
          notes,
          status,
          order_id,
          created_at,
          updated_at,
          sales:sales_id ( id, name, phone ),
          bank_account:bank_account_id ( id, bank_name, account_number, account_holder_name ),
          quotation_items (
            id,
            quotation_id,
            sort_order,
            category_id,
            product_id,
            material_id,
            material_color_id,
            product_name,
            fabric_type,
            fabric_color,
            fabric_specs,
            sewing_notes,
            embroidery_notes,
            print_notes,
            size_breakdown,
            qty,
            unit,
            unit_price,
            subtotal,
            item_notes,
            material:material_id (
              id,
              name,
              brand,
              composition,
              care_instruction,
              description
            )
          )
        `)
        .eq('id', id)
        .single();

      if (err) throw err;

      const quotation: Quotation = {
        ...data,
        quotation_items: (data.quotation_items || []).sort(
          (a: QuotationItem, b: QuotationItem) => (a.sort_order || 0) - (b.sort_order || 0)
        ),
      };

      return quotation;
    } catch (err: any) {
      console.error('Error fetching quotation detail:', err);
      throw err;
    }
  }, []);

  const saveQuotation = useCallback(
    async (
      id: string | null,
      header: Partial<Quotation>,
      items: QuotationItem[]
    ): Promise<string> => {
      try {
        const { data, error: err } = await (supabase as any).rpc('save_quotation', {
          p_quotation_id: id || null,
          p_header: header,
          p_items: items,
        });

        if (err) throw err;
        await fetchQuotations();
        return data as string;
      } catch (err: any) {
        console.error('Error saving quotation:', err);
        throw err;
      }
    },
    [fetchQuotations]
  );

  const setQuotationStatus = useCallback(
    async (id: string, status: 'draft' | 'sent' | 'rejected') => {
      try {
        const { error: err } = await (supabase as any).rpc('set_quotation_status', {
          p_quotation_id: id,
          p_status: status,
        });

        if (err) throw err;
        await fetchQuotations();
      } catch (err: any) {
        console.error('Error updating quotation status:', err);
        throw err;
      }
    },
    [fetchQuotations]
  );

  const deleteQuotation = useCallback(
    async (id: string) => {
      try {
        const { error: err } = await (supabase as any).rpc('delete_quotation', {
          p_quotation_id: id,
        });

        if (err) throw err;
        await fetchQuotations();
      } catch (err: any) {
        console.error('Error deleting quotation:', err);
        throw err;
      }
    },
    [fetchQuotations]
  );

  const linkQuotationToOrder = useCallback(
    async (quotationId: string, orderId: string) => {
      try {
        const { error: err } = await (supabase as any).rpc('link_quotation_to_order', {
          p_quotation_id: quotationId,
          p_order_id: orderId,
        });

        if (err) throw err;
        await fetchQuotations();
      } catch (err: any) {
        console.error('Error linking quotation to order:', err);
        throw err;
      }
    },
    [fetchQuotations]
  );

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  return {
    quotations,
    loading,
    error,
    fetchQuotations,
    getQuotationDetail,
    saveQuotation,
    setQuotationStatus,
    deleteQuotation,
    linkQuotationToOrder,
  };
}
