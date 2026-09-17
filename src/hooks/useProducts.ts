import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Product, ProductMaterialLine, ProductFabricSlot } from "../types";

export interface ProductWithDetails extends Product {
  product_materials?: {
    material_id: string;
    quantity: number;
    materials?: { price: number; name: string; unit: string };
  }[];
  product_fabric_slots?: ProductFabricSlot[];
}

export function useProducts(categoryId?: string | null) {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("products")
      .select(
        "*, product_categories(name), product_materials(material_id, quantity, materials(name, unit, price)), product_fabric_slots(id, fabric_category_id, label, usage_qty, unit, material_categories(name))",
      )
      .order("name", { ascending: true });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setProducts((data ?? []) as ProductWithDetails[]);
      setError(null);
    }
    setLoading(false);
  }, [categoryId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function fetchProductBom(productId: string): Promise<{
    materials: (ProductMaterialLine & {
      materials?: { name: string; unit: string; price: number };
    })[];
    fabricSlots: ProductFabricSlot[];
  }> {
    const [materialsRes, slotsRes] = await Promise.all([
      supabase
        .from("product_materials")
        .select("id, material_id, quantity, materials(name, unit, price)")
        .eq("product_id", productId),
      supabase
        .from("product_fabric_slots")
        .select("id, fabric_category_id, label, usage_qty, unit")
        .eq("product_id", productId),
    ]);

    if (materialsRes.error) throw materialsRes.error;
    if (slotsRes.error) throw slotsRes.error;

    const normalizedMaterials = (materialsRes.data ?? []).map((row: any) => {
      const rel = Array.isArray(row.materials)
        ? row.materials[0]
        : row.materials;
      return {
        id: row.id,
        material_id: row.material_id,
        quantity: row.quantity,
        materials: rel || undefined,
      };
    });

    return {
      materials: normalizedMaterials as (ProductMaterialLine & {
        materials?: { name: string; unit: string; price: number };
      })[],
      fabricSlots: (slotsRes.data ?? []) as ProductFabricSlot[],
    };
  }

  async function createProduct(payload: {
    product: Omit<Product, "id" | "product_categories">;
    materials: ProductMaterialLine[];
    fabricSlots: ProductFabricSlot[];
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    // 1. Insert product
    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert({
        ...payload.product,
        user_id: user.id,
      })
      .select()
      .single();

    if (productError) throw productError;

    // 2. Insert BOM materials (fixed accessories)
    if (payload.materials.length > 0) {
      const materialRows = payload.materials.map((m) => ({
        product_id: newProduct.id,
        material_id: m.material_id,
        quantity: Number(m.quantity),
        user_id: user.id,
      }));
      const { error: materialsError } = await supabase
        .from("product_materials")
        .insert(materialRows);

      if (materialsError) throw materialsError;
    }

    // 3. Insert fabric slots
    if (payload.fabricSlots.length > 0) {
      const slotRows = payload.fabricSlots.map((s) => ({
        product_id: newProduct.id,
        fabric_category_id: s.fabric_category_id || null,
        label: s.label.trim() || "Kain Utama",
        usage_qty: Number(s.usage_qty),
        unit: s.unit || "meter",
        user_id: user.id,
      }));
      const { error: slotsError } = await supabase
        .from("product_fabric_slots")
        .insert(slotRows);

      if (slotsError) throw slotsError;
    }

    await fetchProducts();
    return newProduct as Product;
  }

  async function updateProduct(
    id: string,
    payload: {
      product: Partial<Omit<Product, "id" | "product_categories">>;
      materials: ProductMaterialLine[];
      fabricSlots: ProductFabricSlot[];
    },
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    // 1. Update product
    const { error: productError } = await supabase
      .from("products")
      .update(payload.product)
      .eq("id", id);

    if (productError) throw productError;

    // 2. Refresh BOM materials (delete old then insert new)
    const { error: deleteMatError } = await supabase
      .from("product_materials")
      .delete()
      .eq("product_id", id);
    if (deleteMatError) throw deleteMatError;

    if (payload.materials.length > 0) {
      const materialRows = payload.materials.map((m) => ({
        product_id: id,
        material_id: m.material_id,
        quantity: Number(m.quantity),
        user_id: user.id,
      }));
      const { error: materialsError } = await supabase
        .from("product_materials")
        .insert(materialRows);
      if (materialsError) throw materialsError;
    }

    // 3. Refresh fabric slots (delete old then insert new)
    const { error: deleteSlotsError } = await supabase
      .from("product_fabric_slots")
      .delete()
      .eq("product_id", id);
    if (deleteSlotsError) throw deleteSlotsError;

    if (payload.fabricSlots.length > 0) {
      const slotRows = payload.fabricSlots.map((s) => ({
        product_id: id,
        fabric_category_id: s.fabric_category_id || null,
        label: s.label.trim() || "Kain Utama",
        usage_qty: Number(s.usage_qty),
        unit: s.unit || "meter",
        user_id: user.id,
      }));
      const { error: slotsError } = await supabase
        .from("product_fabric_slots")
        .insert(slotRows);
      if (slotsError) throw slotsError;
    }

    await fetchProducts();
  }

  async function deleteProduct(id: string) {
    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    await fetchProducts();
  }

  return {
    products,
    loading,
    error,
    refetch: fetchProducts,
    fetchProductBom,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}
