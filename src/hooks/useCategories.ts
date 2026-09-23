import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { TransactionCategory, CategoryType } from "../types";

function formatCategoryError(err: unknown) {
  const errorObj = err as { code?: string; message?: string };
  if (
    errorObj?.code === "23505" ||
    errorObj?.message?.toLowerCase().includes("unique") ||
    errorObj?.message?.toLowerCase().includes("duplicate")
  ) {
    return new Error("Kombinasi nama dan tipe kategori sudah ada. Gunakan nama yang berbeda.");
  }
  return err instanceof Error ? err : new Error("Terjadi kesalahan saat menyimpan kategori.");
}

export function useCategories() {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("transaction_categories")
      .select("id, name, type, created_at")
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCategories((data ?? []) as TransactionCategory[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

  async function addCategory(name: string, type: CategoryType) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Nama kategori wajib diisi.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const { error: insertError } = await supabase
      .from("transaction_categories")
      .insert({ name: trimmedName, type, user_id: user.id });

    if (insertError) throw formatCategoryError(insertError);
    await fetchCategories();
  }

  async function updateCategory(id: string, name: string, type: CategoryType) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Nama kategori wajib diisi.");

    const { error: updateError } = await supabase
      .from("transaction_categories")
      .update({ name: trimmedName, type })
      .eq("id", id);

    if (updateError) throw formatCategoryError(updateError);
    await fetchCategories();
  }

  async function deleteCategory(id: string) {
    const { error: deleteError } = await supabase
      .from("transaction_categories")
      .delete()
      .eq("id", id);

    if (deleteError) {
      if (deleteError.code === "23503") {
        throw new Error("Kategori ini masih digunakan oleh transaksi dan tidak bisa dihapus.");
      }
      throw deleteError;
    }
    await fetchCategories();
  }

  return {
    categories,
    incomeCategories,
    expenseCategories,
    loading,
    error,
    addCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories,
  };
}
