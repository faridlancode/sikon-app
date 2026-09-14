import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { SalesPerson } from "../types";

export function useSales() {
  const [sales, setSales] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("sales")
      .select("id, name, phone, is_active")
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setSales((data ?? []) as SalesPerson[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  async function addSales(payload: Partial<SalesPerson>) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    const { error: insertError } = await supabase
      .from("sales")
      .insert({ ...payload, user_id: user.id });
    if (insertError) throw insertError;
    await fetchSales();
  }

  async function updateSales(
    id: string | number,
    payload: Partial<SalesPerson>,
  ) {
    const { error: updateError } = await supabase
      .from("sales")
      .update(payload)
      .eq("id", id);
    if (updateError) throw updateError;
    await fetchSales();
  }

  async function deleteSales(id: string | number) {
    const { error: deleteError } = await supabase
      .from("sales")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;
    await fetchSales();
  }

  const activeSales = sales.filter((s) => s.is_active);

  return {
    sales,
    activeSales,
    loading,
    error,
    refetch: fetchSales,
    addSales,
    updateSales,
    deleteSales,
  };
}
