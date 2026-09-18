import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Staff } from "../types";

export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("staff")
      .select("id, user_id, name, phone, role, is_active, created_at")
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setStaff((data ?? []) as Staff[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  async function addStaff(payload: Partial<Staff>) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { error: insertError } = await supabase
      .from("staff")
      .insert({ ...payload, user_id: user.id });
    if (insertError) throw insertError;
    await fetchStaff();
  }

  async function updateStaff(id: string, payload: Partial<Staff>) {
    const { error: updateError } = await supabase
      .from("staff")
      .update(payload)
      .eq("id", id);
    if (updateError) throw updateError;
    await fetchStaff();
  }

  async function deleteStaff(id: string) {
    const { error: deleteError } = await supabase
      .from("staff")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;
    await fetchStaff();
  }

  const activeStaff = staff.filter((s) => s.is_active);

  return {
    staff,
    activeStaff,
    loading,
    error,
    refetch: fetchStaff,
    addStaff,
    updateStaff,
    deleteStaff,
  };
}
