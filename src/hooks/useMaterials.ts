import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Material } from "../types";

export function useMaterials(categoryId?: string | null) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("materials")
      .select("*, material_categories(name, is_fabric)")
      .order("name", { ascending: true });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setMaterials((data ?? []) as Material[]);
      setError(null);
    }
    setLoading(false);
  }, [categoryId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  async function addMaterial(payload: Omit<Material, "id" | "material_categories">) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { data, error: insertError } = await supabase
      .from("materials")
      .insert({
        ...payload,
        user_id: user.id,
      })
      .select("*, material_categories(name, is_fabric)")
      .single();

    if (insertError) throw insertError;
    await fetchMaterials();
    return data as Material;
  }

  async function updateMaterial(
    id: string,
    payload: Partial<Omit<Material, "id" | "material_categories">>
  ) {
    const { error: updateError } = await supabase
      .from("materials")
      .update(payload)
      .eq("id", id);

    if (updateError) throw updateError;
    await fetchMaterials();
  }

  async function deleteMaterial(id: string) {
    const { error: deleteError } = await supabase
      .from("materials")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    await fetchMaterials();
  }

  return {
    materials,
    loading,
    error,
    refetch: fetchMaterials,
    addMaterial,
    updateMaterial,
    deleteMaterial,
  };
}
