import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { PurchasingReport, PurchasingReportItem } from "../types";

export function usePurchasingReports() {
  const [reports, setReports] = useState<PurchasingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("purchasing_reports")
      .select(`
        *,
        staff:staff!purchasing_reports_staff_id_fkey (
          id,
          name,
          phone,
          role
        ),
        received_by_staff:staff!purchasing_reports_received_by_fkey (
          id,
          name,
          role
        ),
        cash_advances (
          id,
          amount,
          date_given,
          status,
          purpose
        ),
        purchasing_report_items (
          id,
          report_id,
          stock_request_id,
          material_id,
          material_color_id,
          category_id,
          description,
          supplier_name,
          quantity,
          unit,
          unit_price,
          total_price,
          receipt_photo_url,
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
          ),
          stock_requests (
            id,
            quantity_needed,
            unit,
            reason
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setReports((data ?? []) as PurchasingReport[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function createDraftReport(
    header: {
      staff_id: string;
      cash_advance_id?: string | null;
      report_date?: string;
      notes?: string | null;
      service_fee?: number | null;
      status?: 'disbursed' | 'submitted';
    },
    items: Omit<PurchasingReportItem, "id" | "user_id" | "report_id">[]
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const totalAmount = items.reduce(
      (sum, item) => sum + (Number(item.total_price) || 0),
      0
    );

    const initialStatus = header.status || (items.length > 0 ? "submitted" : "disbursed");

    // 1. Insert header report
    const { data: report, error: headerError } = await supabase
      .from("purchasing_reports")
      .insert({
        user_id: user.id,
        staff_id: header.staff_id,
        cash_advance_id: header.cash_advance_id || null,
        report_date: header.report_date || new Date().toISOString().split("T")[0],
        status: initialStatus,
        submitted_at: initialStatus === "submitted" ? new Date().toISOString() : null,
        total_amount: totalAmount,
        service_fee: header.service_fee || 0,
        notes: header.notes?.trim() || null,
      })
      .select()
      .single();

    if (headerError) throw headerError;

    // 2. Insert items
    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        user_id: user.id,
        report_id: report.id,
        stock_request_id: item.stock_request_id || null,
        material_id: item.material_id || null,
        material_color_id: item.material_color_id || null,
        category_id: item.category_id || null,
        description: item.description?.trim() || null,
        supplier_name: item.supplier_name?.trim() || null,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        receipt_photo_url: item.receipt_photo_url || null,
      }));

      const { error: itemsError } = await supabase
        .from("purchasing_report_items")
        .insert(itemRows);

      if (itemsError) throw itemsError;

      // Update linked stock_requests to in_progress with fulfillment_type='spj'
      const linkedReqIds = items
        .map((i) => i.stock_request_id)
        .filter((id): id is string => Boolean(id));

      if (linkedReqIds.length > 0) {
        await supabase
          .from("stock_requests")
          .update({
            status: "in_progress",
            fulfillment_type: "spj",
            purchasing_report_id: report.id,
          })
          .in("id", linkedReqIds);
      }
    }

    await fetchReports();
    return report;
  }

  async function updateDraftReport(
    reportId: string,
    header: {
      staff_id: string;
      cash_advance_id?: string | null;
      report_date?: string;
      notes?: string | null;
      service_fee?: number | null;
      status?: 'disbursed' | 'submitted';
    },
    items: Omit<PurchasingReportItem, "id" | "user_id" | "report_id">[]
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const totalAmount = items.reduce(
      (sum, item) => sum + (Number(item.total_price) || 0),
      0
    );

    const updatePayload: Record<string, any> = {
      staff_id: header.staff_id,
      cash_advance_id: header.cash_advance_id || null,
      report_date: header.report_date || new Date().toISOString().split("T")[0],
      total_amount: totalAmount,
      service_fee: header.service_fee || 0,
      notes: header.notes?.trim() || null,
    };

    if (header.status) {
      updatePayload.status = header.status;
      if (header.status === 'submitted') {
        updatePayload.submitted_at = new Date().toISOString();
      }
    }

    // 1. Update header report
    const { error: headerError } = await supabase
      .from("purchasing_reports")
      .update(updatePayload)
      .eq("id", reportId);

    if (headerError) throw headerError;

    // 2. Delete existing items
    const { error: deleteError } = await supabase
      .from("purchasing_report_items")
      .delete()
      .eq("report_id", reportId);

    if (deleteError) throw deleteError;

    // 3. Re-insert items
    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        user_id: user.id,
        report_id: reportId,
        stock_request_id: item.stock_request_id || null,
        material_id: item.material_id || null,
        material_color_id: item.material_color_id || null,
        category_id: item.category_id || null,
        description: item.description?.trim() || null,
        supplier_name: item.supplier_name?.trim() || null,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        receipt_photo_url: item.receipt_photo_url || null,
      }));

      const { error: itemsError } = await supabase
        .from("purchasing_report_items")
        .insert(itemRows);

      if (itemsError) throw itemsError;

      const linkedReqIds = items
        .map((i) => i.stock_request_id)
        .filter((id): id is string => Boolean(id));

      if (linkedReqIds.length > 0) {
        await supabase
          .from("stock_requests")
          .update({
            status: "in_progress",
            fulfillment_type: "spj",
            purchasing_report_id: reportId,
          })
          .in("id", linkedReqIds);
      }
    }

    await fetchReports();
  }

  async function deleteReport(reportId: string) {
    const { error: deleteError } = await supabase
      .from("purchasing_reports")
      .delete()
      .eq("id", reportId);

    if (deleteError) throw deleteError;
    await fetchReports();
  }

  async function submitReport(reportId: string) {
    const { error } = await supabase
      .from("purchasing_reports")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    if (error) throw error;
    await fetchReports();
  }

  async function approveReport(reportId: string) {
    // If the report is currently disbursed or draft, submit it first so RPC check passes
    const target = reports.find((r) => r.id === reportId);
    if (!target || target.status === 'disbursed' || target.status === 'draft') {
      // Check current db status
      const { data: dbReport } = await supabase
        .from('purchasing_reports')
        .select('status')
        .eq('id', reportId)
        .single();

      if (dbReport && (dbReport.status === 'disbursed' || dbReport.status === 'draft')) {
        const { error: submitErr } = await supabase
          .from('purchasing_reports')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', reportId);
        if (submitErr) throw submitErr;
      }
    }

    const { error } = await supabase.rpc("approve_purchasing_report", {
      p_report_id: reportId,
    });

    if (error) throw error;
    await fetchReports();
  }

  async function rejectReport(reportId: string, reason?: string) {
    const { error } = await supabase.rpc("reject_purchasing_report", {
      p_report_id: reportId,
      p_reason: reason || null,
    });

    if (error) throw error;
    await fetchReports();
  }

  async function approveStockRequestSpj(payload: {
    requestIds: string[];
    purchasingStaffId: string;
    advanceAmount?: number;
    notes?: string;
  }) {
    const { data, error } = await supabase.rpc("approve_stock_request_spj", {
      p_request_ids: payload.requestIds,
      p_purchasing_staff_id: payload.purchasingStaffId,
      p_advance_amount: payload.advanceAmount || 0,
      p_notes: payload.notes || null,
    });

    if (error) throw error;
    await fetchReports();
    return data;
  }

  async function confirmReportReceipt(reportId: string, receivedByStaffId?: string) {
    const { error } = await supabase.rpc("confirm_purchasing_report_receipt", {
      p_report_id: reportId,
      p_received_by: receivedByStaffId || null,
    });

    if (error) throw error;
    await fetchReports();
  }

  async function cancelDisbursedReport(reportId: string, reason?: string) {
    const { error } = await supabase.rpc("cancel_disbursed_report", {
      p_report_id: reportId,
      p_reason: reason || null,
    });

    if (error) throw error;
    await fetchReports();
  }

  return {
    reports,
    loading,
    error,
    refetch: fetchReports,
    createDraftReport,
    updateDraftReport,
    deleteReport,
    submitReport,
    approveReport,
    rejectReport,
    approveStockRequestSpj,
    confirmReportReceipt,
    cancelDisbursedReport,
  };
}
