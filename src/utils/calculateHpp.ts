import type { ProductWithBom, FabricSelection, HppBreakdown, Material } from "../types";

/**
 * Hitung HPP per unit untuk 1 product + pilihan kain per slot.
 * materialsById: map semua material yang relevan (aksesoris di BOM + kain yang dipilih),
 * key = material.id, supaya function ini tidak perlu fetch sendiri.
 */
export function calculateHpp(
  product: ProductWithBom,
  fabricSelections: FabricSelection[] = [],
  materialsById: Record<string, Material> = {}
): HppBreakdown {
  const sewingCost = Number(product.sewing_cost_per_pcs) || 0;
  const cuttingCost = Number(product.cutting_cost_per_pcs) || 0;

  const fixedMaterialsCost = (product.materials ?? []).reduce((sum, line) => {
    const material = materialsById[line.material_id];
    const price = Number(material?.price) || Number(line.materials?.price) || 0;
    const qty = Number(line.quantity) || 0;
    return sum + price * qty;
  }, 0);

  const fabricLines = (fabricSelections ?? []).map((sel) => {
    const material = materialsById[sel.materialId];
    const price = Number(material?.price) || Number(sel.price) || 0;
    const usageQty = Number(sel.usageQty) || 0;
    const lineCost = price * usageQty;
    return {
      slotId: sel.slotId,
      slotLabel: sel.slotLabel,
      materialId: sel.materialId,
      materialColorId: sel.materialColorId || null,
      usageQty,
      price,
      lineCost,
    };
  });

  const fabricCost = fabricLines.reduce((sum, l) => sum + l.lineCost, 0);

  return {
    sewingCost,
    cuttingCost,
    fixedMaterialsCost,
    fabricCost,
    hppPerUnit: sewingCost + cuttingCost + fixedMaterialsCost + fabricCost,
    fabricLines,
  };
}
