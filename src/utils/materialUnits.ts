import type { Material, MaterialPurchaseUnit } from "../types";

export function getMaterialPurchaseUnits(
  material: Pick<
    Material,
    "unit" | "purchase_unit" | "conversion_rate" | "purchase_units"
  >,
): MaterialPurchaseUnit[] {
  const normalizedBaseUnit = material.unit.trim().toLowerCase();
  const configuredUnits = (material.purchase_units || []).filter(
    (unit) =>
      unit.is_active && unit.name.trim().toLowerCase() !== normalizedBaseUnit,
  );
  const baseUnit: MaterialPurchaseUnit = {
    id: "base-unit",
    name: material.unit,
    conversion_rate: 1,
    is_variable: false,
    is_primary: false,
    is_active: true,
  };
  if (configuredUnits.length > 0) return [baseUnit, ...configuredUnits];

  if (
    material.purchase_unit &&
    material.purchase_unit.trim().toLowerCase() !== normalizedBaseUnit
  ) {
    return [
      baseUnit,
      {
        id: "legacy-primary",
        name: material.purchase_unit,
        conversion_rate: Number(material.conversion_rate) || 1,
        is_variable: false,
        is_primary: true,
        is_active: true,
      },
    ];
  }

  return [{ ...baseUnit, is_primary: true }];
}

export function getPrimaryPurchaseUnit(
  units: MaterialPurchaseUnit[],
): MaterialPurchaseUnit | undefined {
  return units.find((unit) => unit.is_primary) || units[0];
}

export function getBaseQuantity(
  quantity: number,
  conversionRate: number | null,
  isVariable: boolean,
  actualBaseQuantity?: number | null,
): number | null {
  if (isVariable) {
    return actualBaseQuantity != null && actualBaseQuantity > 0
      ? actualBaseQuantity
      : null;
  }
  const rate = Number(conversionRate);
  return quantity > 0 && rate > 0 ? quantity * rate : null;
}

export function getPurchaseUnitPrice(
  baseUnitPrice: number,
  unit: MaterialPurchaseUnit,
): number | null {
  if (unit.is_variable || !unit.conversion_rate || unit.conversion_rate <= 0)
    return null;
  return baseUnitPrice * unit.conversion_rate;
}
