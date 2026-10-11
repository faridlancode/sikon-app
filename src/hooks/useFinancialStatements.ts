import { useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import type {
  IncomeStatementReport,
  BalanceSheetReport,
  AccountingCheck,
  ClosePreview,
} from '../types';

export function useFinancialStatements() {
  const getIncomeStatement = useCallback(
    async (
      from: string,
      to: string,
      compareFrom: string | null = null,
      compareTo: string | null = null,
      includeProvisional: boolean = true
    ): Promise<IncomeStatementReport> => {
      const { data, error } = await (supabase as any).rpc('get_income_statement', {
        p_from: from,
        p_to: to,
        p_compare_from: compareFrom || null,
        p_compare_to: compareTo || null,
        p_include_provisional: includeProvisional,
      });

      if (error) throw error;
      return data as IncomeStatementReport;
    },
    []
  );

  const getBalanceSheet = useCallback(
    async (
      asOf: string,
      compareAsOf: string | null = null,
      includeProvisional: boolean = true
    ): Promise<BalanceSheetReport> => {
      const { data, error } = await (supabase as any).rpc('get_balance_sheet', {
        p_as_of: asOf,
        p_compare_as_of: compareAsOf || null,
        p_include_provisional: includeProvisional,
      });

      if (error) throw error;
      return data as BalanceSheetReport;
    },
    []
  );

  const getAccountingChecks = useCallback(
    async (asOf: string): Promise<AccountingCheck[]> => {
      const { data, error } = await (supabase as any).rpc('get_accounting_checks', {
        p_as_of: asOf,
      });

      if (error) throw error;
      return (data as AccountingCheck[]) || [];
    },
    []
  );

  const getClosePreview = useCallback(async (): Promise<ClosePreview> => {
    const { data, error } = await (supabase as any).rpc('get_close_preview');
    if (error) throw error;
    return data as ClosePreview;
  }, []);

  const closePeriod = useCallback(async (periodEnd: string) => {
    const { data, error } = await (supabase as any).rpc('close_accounting_period', {
      p_period_end: periodEnd,
    });
    if (error) throw error;
    return data;
  }, []);

  const reopenPeriod = useCallback(
    async (newLockedThrough: string | null = null) => {
      const { data, error } = await (supabase as any).rpc(
        'reopen_accounting_period',
        {
          p_new_locked_through: newLockedThrough || null,
        }
      );
      if (error) throw error;
      return data;
    },
    []
  );

  return {
    getIncomeStatement,
    getBalanceSheet,
    getAccountingChecks,
    getClosePreview,
    closePeriod,
    reopenPeriod,
  };
}
