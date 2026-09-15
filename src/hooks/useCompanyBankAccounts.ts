import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { BankAccount } from "../types";

export function useCompanyBankAccounts() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("company_bank_accounts")
      .select("id, bank_name, account_number, account_holder_name, is_primary")
      .order("is_primary", { ascending: false })
      .order("bank_name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAccounts(data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function addAccount(payload: Omit<BankAccount, "id">) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    const { error: insertError } = await supabase
      .from("company_bank_accounts")
      .insert({ ...payload, user_id: user.id });
    if (insertError) throw insertError;
    await fetchAccounts();
  }

  async function updateAccount(id: string, payload: Partial<Omit<BankAccount, "id">>) {
    const { error: updateError } = await supabase.from("company_bank_accounts").update(payload).eq("id", id);
    if (updateError) throw updateError;
    await fetchAccounts();
  }

  async function deleteAccount(id: string) {
    const { error: deleteError } = await supabase.from("company_bank_accounts").delete().eq("id", id);
    if (deleteError) throw deleteError;
    await fetchAccounts();
  }

  return { accounts, loading, error, refetch: fetchAccounts, addAccount, updateAccount, deleteAccount };
}
