import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import type {
  Account,
  AccountingSettings,
  JournalEntry,
  OpeningBalanceSuggestion,
  TrialBalanceRow,
  GeneralLedgerRow,
} from '../types';

export function useAccounting() {
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('accounting_settings')
        .select('*')
        .maybeSingle();

      if (err) throw err;
      setSettings((data as AccountingSettings) || null);
    } catch (e: any) {
      console.error('Error fetching accounting settings:', e);
      setError(e.message);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('accounts')
        .select('*')
        .order('code', { ascending: true });

      if (err) throw err;
      setAccounts((data as Account[]) || []);
    } catch (e: any) {
      console.error('Error fetching accounts:', e);
      setError(e.message);
    }
  }, []);

  const fetchJournalEntries = useCallback(async (filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: string;
    search?: string;
  }) => {
    try {
      let query = (supabase as any)
        .from('journal_entries')
        .select(`
          id,
          user_id,
          entry_no,
          entry_date,
          description,
          source_type,
          source_id,
          created_at,
          journal_lines (
            id,
            entry_id,
            account_id,
            debit,
            credit,
            memo,
            line_no,
            accounts (
              id,
              code,
              name
            )
          )
        `)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('entry_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('entry_date', filters.endDate);
      }
      if (filters?.sourceType && filters.sourceType !== 'all') {
        query = query.eq('source_type', filters.sourceType);
      }
      if (filters?.search) {
        query = query.or(
          `entry_no.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setJournalEntries((data as unknown as JournalEntry[]) || []);
    } catch (e: any) {
      console.error('Error fetching journal entries:', e);
      setError(e.message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSettings(), fetchAccounts(), fetchJournalEntries()]);
    setLoading(false);
  }, [fetchSettings, fetchAccounts, fetchJournalEntries]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // RPC: Aktifkan akuntansi
  const activateAccounting = async (booksStartDate: string) => {
    const { error: rpcErr } = await (supabase as any).rpc('init_accounting', {
      p_books_start_date: booksStartDate,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    await refreshAll();
  };

  // RPC: Ambil usulan saldo awal
  const getOpeningBalanceSuggestion = async (
    booksStartDate: string
  ): Promise<OpeningBalanceSuggestion[]> => {
    const { data, error: rpcErr } = await (supabase as any).rpc(
      'suggest_opening_balance',
      {
        p_books_start_date: booksStartDate,
      }
    );
    if (rpcErr) throw new Error(rpcErr.message);
    return (data as unknown as OpeningBalanceSuggestion[]) || [];
  };

  // RPC: Simpan saldo awal
  const postOpeningBalance = async (date: string, lines: any[]) => {
    const { error: rpcErr } = await (supabase as any).rpc('post_opening_balance', {
      p_date: date,
      p_lines: lines,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    await refreshAll();
  };

  // RPC: Buat jurnal manual
  const createManualJournal = async (entry: {
    entry_date: string;
    description: string;
    lines: {
      account_id: string;
      debit: number;
      credit: number;
      memo?: string;
    }[];
  }) => {
    const { data, error: rpcErr } = await (supabase as any).rpc('post_journal_entry', {
      p_date: entry.entry_date,
      p_description: entry.description,
      p_lines: entry.lines,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    await fetchJournalEntries();
    return data;
  };

  // RPC: Balik jurnal manual
  const reverseJournal = async (entryId: string, reason: string) => {
    const { data, error: rpcErr } = await (supabase as any).rpc('reverse_journal_entry', {
      p_entry_id: entryId,
      p_reason: reason,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    await fetchJournalEntries();
    return data;
  };

  // RPC: Neraca Saldo (get_trial_balance)
  const getTrialBalance = async (
    from: string,
    to: string
  ): Promise<TrialBalanceRow[]> => {
    const { data, error: rpcErr } = await (supabase as any).rpc('get_trial_balance', {
      p_from: from,
      p_to: to,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return (data as unknown as TrialBalanceRow[]) || [];
  };

  // RPC: Buku Besar (get_general_ledger)
  const getGeneralLedger = async (
    accountId: string,
    from: string,
    to: string
  ): Promise<GeneralLedgerRow[]> => {
    const { data, error: rpcErr } = await (supabase as any).rpc('get_general_ledger', {
      p_account_id: accountId,
      p_from: from,
      p_to: to,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return (data as unknown as GeneralLedgerRow[]) || [];
  };

  // CRUD Akun (COA) - langsung ke tabel accounts
  const createAccount = async (payload: {
    code: string;
    name: string;
    account_type: string;
    report_group: string;
    is_cash?: boolean;
    cash_flow_activity?: string;
  }) => {
    const { error: insErr } = await (supabase as any).from('accounts').insert({
      code: payload.code.trim(),
      name: payload.name.trim(),
      account_type: payload.account_type,
      report_group: payload.report_group,
      is_cash: payload.account_type === 'asset' ? Boolean(payload.is_cash) : false,
      cash_flow_activity: payload.cash_flow_activity || 'operating',
      is_system: false,
      is_active: true,
    });
    if (insErr) throw new Error(insErr.message);
    await fetchAccounts();
  };

  const updateAccountName = async (accountId: string, newName: string) => {
    const { error: updErr } = await (supabase as any)
      .from('accounts')
      .update({ name: newName.trim() })
      .eq('id', accountId);
    if (updErr) throw new Error(updErr.message);
    await fetchAccounts();
  };

  const toggleAccountActive = async (accountId: string, isActive: boolean) => {
    const { error: updErr } = await (supabase as any)
      .from('accounts')
      .update({ is_active: isActive })
      .eq('id', accountId);
    if (updErr) throw new Error(updErr.message);
    await fetchAccounts();
  };

  const deleteAccount = async (accountId: string) => {
    const { error: delErr } = await (supabase as any)
      .from('accounts')
      .delete()
      .eq('id', accountId);
    if (delErr) throw new Error(delErr.message);
    await fetchAccounts();
  };

  return {
    settings,
    accounts,
    journalEntries,
    loading,
    error,
    refreshAll,
    fetchSettings,
    fetchAccounts,
    fetchJournalEntries,
    activateAccounting,
    getOpeningBalanceSuggestion,
    postOpeningBalance,
    createManualJournal,
    reverseJournal,
    getTrialBalance,
    getGeneralLedger,
    createAccount,
    updateAccountName,
    toggleAccountActive,
    deleteAccount,
  };
}
