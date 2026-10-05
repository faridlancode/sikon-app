import { useState } from "react";
import Button from "../ui/button";
import { Pencil, Trash2, Package, Sparkles, Palette, ChevronDown, ChevronUp } from "lucide-react";
import { formatIDR, formatPurchaseUnit } from "../../utils/formatCurrency";
import type { Material, MaterialColor } from "../../types";
import { getMaterialPurchaseUnits, getPrimaryPurchaseUnit } from "../../utils/materialUnits";

interface MaterialsTableProps {
  materials: Material[];
  colorsByMaterial?: Record<string, MaterialColor[]>;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
}

export default function MaterialsTable({
  materials,
  colorsByMaterial = {},
  onEdit,
  onDelete,
}: MaterialsTableProps) {
  const [expandedColors, setExpandedColors] = useState<Record<string, boolean>>({});

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Tidak ada material ditemukan
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Coba pilih kategori lain atau tambahkan material baru.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted/60">
            <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Varian warna</th>
              <th className="px-4 py-3">Satuan dasar & pembelian</th>
              <th className="px-4 py-3 text-right">Harga pembelian</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {materials.map((m) => {
              const isFabric = Boolean(m.material_categories?.is_fabric);
              const colors = colorsByMaterial[m.id] || [];
              const purchaseUnits = getMaterialPurchaseUnits(m).filter((unit) => unit.id !== "base-unit");
              const primaryPurchaseUnit = getPrimaryPurchaseUnit(purchaseUnits);
              const hasMultiUom = Boolean(
                primaryPurchaseUnit &&
                !primaryPurchaseUnit.is_variable &&
                primaryPurchaseUnit.name !== m.unit &&
                Number(primaryPurchaseUnit.conversion_rate) > 0
              );
              const showAllColors = Boolean(expandedColors[m.id]);
              const purchasePrice = Math.round(Number(m.price || 0) * Number(primaryPurchaseUnit?.conversion_rate || 1));

              return (
                <tr
                  key={m.id}
                  className="transition-colors hover:bg-muted/30"
                >
                  {/* Material Warna */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      {isFabric ? (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary shrink-0 mt-0.5 border border-border"
                          title="Bahan Kain"
                        >
                          <Sparkles className="h-4 w-4" />
                        </span>
                      ) : (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0 mt-0.5 border border-border"
                          title="Bahan Non-Kain / Aksesoris"
                        >
                          <Package className="h-4 w-4" />
                        </span>
                      )}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-foreground">{m.name}</p>
                          {m.brand && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              {m.brand}
                            </span>
                          )}
                        </div>

                        {m.composition && (
                          <p className="text-xs text-muted-foreground max-w-[240px]">
                            {m.composition}
                          </p>
                        )}

                      </div>
                    </div>
                  </td>

                  {/* Kategori */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {m.material_categories?.name || "Tanpa Kategori"}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 max-w-[230px]">
                    {colors.length > 0 ? (
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Palette className="h-3.5 w-3.5" />{colors.length} warna
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(showAllColors ? colors : colors.slice(0, 3)).map((color) => (
                            <span key={color.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground" title={color.color_name}>
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border bg-muted" style={color.color_code ? { backgroundColor: color.color_code } : undefined} />
                              <span className="break-words">{color.color_name}</span>
                            </span>
                          ))}
                        </div>
                        {colors.length > 3 && (
                          <Button variant="ghost" size="sm" aria-expanded={showAllColors} aria-label={`${showAllColors ? "Ringkas" : "Lihat semua"} warna ${m.name}`} onClick={() => setExpandedColors((prev) => ({ ...prev, [m.id]: !prev[m.id] }))} className="mt-1 h-7 gap-1 px-0 text-xs text-primary">
                            {showAllColors ? <ChevronUp /> : <ChevronDown />}{showAllColors ? "Ringkas" : `+${colors.length - 3} warna`}
                          </Button>
                        )}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Tanpa varian</span>}
                  </td>

                  {/* Satuan dasar & pembelian */}
                  <td className="px-4 py-3.5 text-muted-foreground text-xs">
                    <div>
                      <span className="font-semibold text-foreground">{m.unit}</span>
                      {purchaseUnits.length > 0 && (
                        <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                          {purchaseUnits.map((purchaseUnit) => (
                            <p key={purchaseUnit.id}>
                              {purchaseUnit.is_primary ? "Utama: " : ""}
                              {purchaseUnit.is_variable
                                ? `${formatPurchaseUnit(purchaseUnit.name)} (isi variabel)`
                                : `1 ${formatPurchaseUnit(purchaseUnit.name)} = ${purchaseUnit.conversion_rate} ${m.unit}`}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Harga Beli Grosir vs Harga Pokok Satuan */}
                  <td className="px-4 py-3.5 text-right tabular-nums">
                    {hasMultiUom && primaryPurchaseUnit ? (
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {formatIDR(purchasePrice)} <span className="text-[10px] text-muted-foreground font-normal">/{formatPurchaseUnit(primaryPurchaseUnit.name)}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium">
                          ({formatIDR(m.price)} / {m.unit})
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-semibold text-foreground">
                          {formatIDR(m.price)}
                        </span>
                        <span className="text-[10px] text-muted-foreground block font-normal">
                          /{m.unit}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.is_active
                          ? "bg-accent text-accent-foreground border border-primary/20"
                          : "bg-muted text-muted-foreground border border-border"
                        }`}
                    >
                      {m.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>

                  {/* Aksi */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Edit material ${m.name}`}
                        onClick={() => onEdit(m)}
                        className="h-8 gap-1.5 px-2.5 text-xs"
                        title="Edit material, harga & variasi warna"
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Hapus material ${m.name}`}
                        onClick={() => onDelete(m)}
                        className="h-8 w-8 p-0"
                        title="Hapus material"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
