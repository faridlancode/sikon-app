import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayISO } from '../utils/dateHelpers';
import type { PoDailyReport, PoCloseReport, PoMonthlyReport } from '../types';

export function usePoReports() {
  const [dailyReport, setDailyReport] = useState<PoDailyReport | null>(null);
  const [loadingDaily, setLoadingDaily] = useState<boolean>(false);

  const [closeReport, setCloseReport] = useState<PoCloseReport | null>(null);
  const [loadingClose, setLoadingClose] = useState<boolean>(false);

  const [monthlyReport, setMonthlyReport] = useState<PoMonthlyReport | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState<boolean>(false);

  const [reportError, setReportError] = useState<string | null>(null);

  // 1. Fetch Laporan Harian
  const fetchDailyReport = useCallback(async (dateStr?: string) => {
    const targetDate = dateStr || todayISO();
    setLoadingDaily(true);
    setReportError(null);
    try {
      const { data, error } = await (supabase as any).rpc('get_po_daily_report', {
        p_date: targetDate,
      });
      if (error) throw error;
      setDailyReport(data);
      return data;
    } catch (err: any) {
      console.error('Error fetching PO daily report:', err);
      setReportError(err?.message || 'Gagal memuat laporan harian PO');
      return null;
    } finally {
      setLoadingDaily(false);
    }
  }, []);

  // 2. Fetch Laporan Close PO
  const fetchCloseReport = useCallback(async (batchId: string) => {
    if (!batchId) return null;
    setLoadingClose(true);
    setReportError(null);
    try {
      const { data, error } = await (supabase as any).rpc('get_po_close_report', {
        p_batch_id: batchId,
      });
      if (error) throw error;
      setCloseReport(data);
      return data;
    } catch (err: any) {
      console.error('Error fetching PO close report:', err);
      setReportError(err?.message || 'Gagal memuat laporan close PO');
      return null;
    } finally {
      setLoadingClose(false);
    }
  }, []);

  // 3. Fetch Laporan Bulanan PO
  const fetchMonthlyReport = useCallback(async (year: number, month: number) => {
    setLoadingMonthly(true);
    setReportError(null);
    try {
      const { data, error } = await (supabase as any).rpc('get_po_monthly_report', {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      setMonthlyReport(data);
      return data;
    } catch (err: any) {
      console.error('Error fetching PO monthly report:', err);
      setReportError(err?.message || 'Gagal memuat laporan bulanan PO');
      return null;
    } finally {
      setLoadingMonthly(false);
    }
  }, []);

  return {
    dailyReport,
    loadingDaily,
    closeReport,
    loadingClose,
    monthlyReport,
    loadingMonthly,
    reportError,
    fetchDailyReport,
    fetchCloseReport,
    fetchMonthlyReport,
  };
}
