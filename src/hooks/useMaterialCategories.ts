import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { MaterialCategory } from "../types";

function formatCategoryError(err: unknown) {
  const errorObj = err as { code?: string; message?: string };
  if (
    errorObj?.code === "23505" ||
    errorObj?.message?.toLowerCase().includes("unique") ||
    errorObj?.message?.toLowerCase().includes("duplicate")
  ) {
    return new Error("Nama kategori sudah digunakan. Gunakan nama yang berbeda.");
  }
  return err instanceof Error ? err : new Error("Terjadi kesalahan saat menyimpan kategori.");
}

export function useMaterialCategories() {
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("material_categories")
      .select("id, name, is_fabric")
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCategories((data ?? []) as MaterialCategory[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function addCategory(payload: { name: string; is_fabric?: boolean }) {
    const trimmedName = payload.name.trim();
    if (!trimmedName) throw new Error("Nama kategori wajib diisi.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { error: insertError } = await supabase.from("material_categories").insert({
      name: trimmedName,
      is_fabric: Boolean(payload.is_fabric),
      user_id: user.id,
    });

    if (insertError) throw formatCategoryError(insertError);
    await fetchCategories();
  }

  async function updateCategory(
    id: string,
    payload: { name: string; is_fabric?: boolean }
  ) {
    const trimmedName = payload.name.trim();
    if (!trimmedName) throw new Error("Nama kategori wajib diisi.");

    const { error: updateError } = await supabase
      .from("material_categories")
      .update({
        name: trimmedName,
        is_fabric: Boolean(payload.is_fabric),
      })
      .eq("id", id);

    if (updateError) throw formatCategoryError(updateError);
    await fetchCategories();
  }

  async function deleteCategory(id: string) {
    const { error: deleteError } = await supabase
      .from("material_categories")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    await fetchCategories();
  }

  return {
    categories,
    loading,
    error,
    addCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories,
  };
}
