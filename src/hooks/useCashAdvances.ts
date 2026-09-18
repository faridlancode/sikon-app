import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { CashAdvance } from "../types";

export function useCashAdvances() {
  const [advances, setAdvances] = useState<CashAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdvances = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("cash_advances")
      .select(`
        *,
        staff (
          id,
          name,
          role
        )
      `)
      .order("date_given", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAdvances((data ?? []) as CashAdvance[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdvances();
  }, [fetchAdvances]);

  async function giveCashAdvance(payload: {
    staff_id: string;
    amount: number;
    purpose?: string | null;
    date?: string;
  }) {
    const { data, error } = await supabase.rpc("give_cash_advance", {
      p_staff_id: payload.staff_id,
      p_amount: payload.amount,
      p_purpose: payload.purpose || null,
      p_date: payload.date || new Date().toISOString().split("T")[0],
    });

    if (error) throw error;
    await fetchAdvances();
    return data;
  }

  const outstandingAdvances = advances.filter((a) => a.status === "outstanding");
  const settledAdvances = advances.filter((a) => a.status === "settled");
  const totalOutstanding = outstandingAdvances.reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0
  );

  return {
    advances,
    outstandingAdvances,
    settledAdvances,
    totalOutstanding,
    loading,
    error,
    refetch: fetchAdvances,
    giveCashAdvance,
  };
}
