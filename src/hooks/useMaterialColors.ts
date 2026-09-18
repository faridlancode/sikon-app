import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { MaterialColor } from "../types";

export function useMaterialColors(materialId?: string | null) {
  const [colors, setColors] = useState<MaterialColor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchColors = useCallback(async () => {
    if (!materialId) {
      setColors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("material_colors")
      .select("*")
      .eq("material_id", materialId)
      .eq("is_active", true)
      .order("color_name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setColors((data ?? []) as MaterialColor[]);
      setError(null);
    }
    setLoading(false);
  }, [materialId]);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  async function addColor(payload: { color_name: string; color_code?: string | null }) {
    if (!materialId) throw new Error("Material ID tidak valid.");
    const trimmedName = payload.color_name.trim();
    if (!trimmedName) throw new Error("Nama warna wajib diisi.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { error: insertError } = await supabase
      .from("material_colors")
      .insert({
        material_id: materialId,
        color_name: trimmedName,
        color_code: payload.color_code?.trim() || null,
        user_id: user.id,
        is_active: true,
      });

    if (insertError) throw insertError;
    await fetchColors();
  }

  async function deleteColor(id: string) {
    const { error: deleteError } = await supabase
      .from("material_colors")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    await fetchColors();
  }

  return {
    colors,
    loading,
    error,
    refetch: fetchColors,
    addColor,
    deleteColor,
  };
}
