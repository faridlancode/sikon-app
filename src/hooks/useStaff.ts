import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Staff } from "../types";

export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    // Join ke tabel sales: untuk staf yang punya sales_id,
    // nama/HP/status SELALU diambil real-time dari tabel sales (bukan salinan yang bisa basi).
    const { data, error: fetchError } = await supabase
      .from("staff")
      .select("id, user_id, name, phone, role, wage_type, daily_rate, sales_id, is_active, created_at, sales(name, phone, is_active)")
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      // Override name/phone/is_active dengan data dari tabel sales (sumber kebenaran)
      const normalized = (data ?? []).map((row: any) => {
        const salesData = Array.isArray(row.sales) ? row.sales[0] : row.sales;
        if (row.sales_id && salesData) {
          return {
            ...row,
            name: salesData.name ?? row.name,
            phone: salesData.phone ?? row.phone,
            is_active: salesData.is_active ?? row.is_active,
            sales: undefined,
          } as Staff;
        }
        const { sales: _ignored, ...rest } = row;
        return rest as Staff;
      });
      setStaff(normalized);
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

    // Staff role='Sales' HARUS sudah punya sales_id dari luar (dipilih dari daftar sales).
    // Tidak ada auto-create sales dari sini — user diarahkan ke menu Sales dulu.
    const { error: insertError } = await supabase
      .from("staff")
      .insert({ ...payload, user_id: user.id });
    if (insertError) throw insertError;
    await fetchStaff();
  }

  async function updateStaff(id: string, payload: Partial<Staff>) {
    // Staff TIDAK pernah menulis ke tabel sales — sales adalah sumber kebenaran.
    // Kalau data berubah, user harus edit dari halaman Sales.
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
