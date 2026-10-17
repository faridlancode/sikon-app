import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Invoice, InvoiceItem, InvoiceStatus, InvoiceType } from '../types';

export interface InvoiceFilters {
  search?: string;
  status?: string;
  invoiceType?: string;
  startDate?: string;
  endDate?: string;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async (filters?: InvoiceFilters) => {
    try {
      setLoading(true);
      setError(null);

      let query = (supabase as any)
        .from('invoices')
        .select(`
          id,
          user_id,
          invoice_no,
          invoice_date,
          due_date,
          invoice_type,
          customer_name,
          customer_address,
          source_type,
          quotation_id,
          order_id,
          subtotal,
          shipping_cost,
          grand_total,
          paid_amount,
          amount_due,
          bank_account_id,
          notes,
          status,
          created_at,
          updated_at,
          bank_account:bank_account_id ( id, bank_name, account_number, account_holder_name ),
          quotation:quotation_id ( id, quotation_no ),
          order:order_id ( id, order_id ),
          invoice_items (
            id,
            invoice_id,
            sort_order,
            product_name,
            description,
            qty,
            unit,
            unit_price,
            subtotal
          )
        `)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.invoiceType && filters.invoiceType !== 'all') {
        query = query.eq('invoice_type', filters.invoiceType);
      }
      if (filters?.startDate) {
        query = query.gte('invoice_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('invoice_date', filters.endDate);
      }
      if (filters?.search) {
        query = query.or(
          `invoice_no.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`
        );
      }

      const { data, error: err } = await query;
      if (err) throw err;

      // Urutkan item berdasarkan sort_order
      const formatted: Invoice[] = (data || []).map((inv: any) => ({
        ...inv,
        invoice_items: (inv.invoice_items || []).sort(
          (a: InvoiceItem, b: InvoiceItem) => (a.sort_order || 0) - (b.sort_order || 0)
        ),
      }));

      setInvoices(formatted);
    } catch (err: any) {
      console.error('Error fetching invoices:', err);
      setError(err.message || 'Gagal memuat invoice');
    } finally {
      setLoading(false);
    }
  }, []);

  const getInvoiceDetail = useCallback(async (id: string): Promise<Invoice | null> => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('invoices')
        .select(`
          id,
          user_id,
          invoice_no,
          invoice_date,
          due_date,
          invoice_type,
          customer_name,
          customer_address,
          source_type,
          quotation_id,
          order_id,
          subtotal,
          shipping_cost,
          grand_total,
          paid_amount,
          amount_due,
          bank_account_id,
          notes,
          status,
          created_at,
          updated_at,
          bank_account:bank_account_id ( id, bank_name, account_number, account_holder_name ),
          quotation:quotation_id ( id, quotation_no ),
          order:order_id ( id, order_id ),
          invoice_items (
            id,
            invoice_id,
            sort_order,
            product_name,
            description,
            qty,
            unit,
            unit_price,
            subtotal
          )
        `)
        .eq('id', id)
        .single();

      if (err) throw err;

      const invoice: Invoice = {
        ...data,
        invoice_items: (data.invoice_items || []).sort(
          (a: InvoiceItem, b: InvoiceItem) => (a.sort_order || 0) - (b.sort_order || 0)
        ),
      };

      return invoice;
    } catch (err: any) {
      console.error('Error fetching invoice detail:', err);
      return null;
    }
  }, []);

  const saveInvoice = useCallback(
    async (
      id: string | null,
      header: Partial<Invoice>,
      items: InvoiceItem[]
    ): Promise<string> => {
      try {
        const { data, error: err } = await (supabase as any).rpc('save_invoice', {
          p_invoice_id: id || null,
          p_header: header,
          p_items: items,
        });

        if (err) throw err;
        await fetchInvoices();
        return data as string;
      } catch (err: any) {
        console.error('Error saving invoice:', err);
        throw err;
      }
    },
    [fetchInvoices]
  );

  const setInvoiceStatus = useCallback(
    async (id: string, status: InvoiceStatus) => {
      try {
        const { error: err } = await (supabase as any).rpc('set_invoice_status', {
          p_invoice_id: id,
          p_status: status,
        });

        if (err) throw err;
        await fetchInvoices();
      } catch (err: any) {
        console.error('Error updating invoice status:', err);
        throw err;
      }
    },
    [fetchInvoices]
  );

  const deleteInvoice = useCallback(
    async (id: string) => {
      try {
        const { error: err } = await (supabase as any).rpc('delete_invoice', {
          p_invoice_id: id,
        });

        if (err) throw err;
        await fetchInvoices();
      } catch (err: any) {
        console.error('Error deleting invoice:', err);
        throw err;
      }
    },
    [fetchInvoices]
  );

  const createInvoiceFromQuotation = useCallback(
    async (
      quotationId: string,
      invoiceType: InvoiceType = 'dp',
      amountDue: number | null = null
    ): Promise<string> => {
      try {
        const { data, error: err } = await (supabase as any).rpc(
          'create_invoice_from_quotation',
          {
            p_quotation_id: quotationId,
            p_invoice_type: invoiceType,
            p_amount_due: amountDue,
          }
        );

        if (err) throw err;
        await fetchInvoices();
        return data as string;
      } catch (err: any) {
        console.error('Error creating invoice from quotation:', err);
        throw err;
      }
    },
    [fetchInvoices]
  );

  const createInvoiceFromOrder = useCallback(
    async (
      orderId: string,
      invoiceType: InvoiceType = 'pelunasan'
    ): Promise<string> => {
      try {
        const { data, error: err } = await (supabase as any).rpc(
          'create_invoice_from_order',
          {
            p_order_id: orderId,
            p_invoice_type: invoiceType,
          }
        );

        if (err) throw err;
        await fetchInvoices();
        return data as string;
      } catch (err: any) {
        console.error('Error creating invoice from order:', err);
        throw err;
      }
    },
    [fetchInvoices]
  );

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return {
    invoices,
    loading,
    error,
    fetchInvoices,
    getInvoiceDetail,
    saveInvoice,
    setInvoiceStatus,
    deleteInvoice,
    createInvoiceFromQuotation,
    createInvoiceFromOrder,
  };
}
