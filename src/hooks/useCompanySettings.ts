import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useCompanySettings() {
  const [saldoAwal, setSaldoAwal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_settings")
      .select("saldo_awal")
      .maybeSingle();
    if (!error && data) {
      setSaldoAwal(Number(data.saldo_awal) || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function updateSaldoAwal(value: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    const { error } = await supabase
      .from("company_settings")
      .upsert({
        user_id: user.id,
        saldo_awal: value,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    setSaldoAwal(value);
  }

  return { saldoAwal, loading, updateSaldoAwal, refetch: fetchSettings };
}
