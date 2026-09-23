import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Transaction } from "../types";

/**
 * Mengelola daftar transaksi milik owner: fetch, create, update, delete.
 * RLS di Supabase memastikan hanya baris milik user_id yang login yang terjangkau.
 */
export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("transactions")
      .select(
        "id, title, amount, type, transaction_date, description, category_id, order_id, transaction_categories(name), orders(order_id, customer_name)",
      )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setTransactions((data ?? []) as Transaction[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  async function addTransaction(
    payload: Partial<Transaction> & { user_id?: string },
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    const { error: insertError } = await supabase.from("transactions").insert({
      ...payload,
      user_id: user.id,
    });
    if (insertError) throw insertError;
    await fetchTransactions();
  }

  async function updateTransaction(
    id: string | number,
    payload: Partial<Transaction>,
  ) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", id);
    if (updateError) throw updateError;
    await fetchTransactions();
  }

  async function deleteTransaction(id: string | number) {
    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;
    await fetchTransactions();
  }

  return {
    transactions,
    loading,
    error,
    refetch: fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
