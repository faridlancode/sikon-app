import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useProductCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("product_categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (fetchError) setError(fetchError.message);
    else {
      setCategories(data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function addCategory(name) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Nama kategori wajib diisi.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { error: insertError } = await supabase
      .from("product_categories")
      .insert({ name: trimmedName, user_id: user.id });
    if (insertError) throw insertError;
    await fetchCategories();
  }

  async function deleteCategory(id) {
    const { error: deleteError } = await supabase
      .from("product_categories")
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
    deleteCategory,
    refetch: fetchCategories,
  };
}
