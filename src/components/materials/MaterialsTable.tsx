import { Pencil, Trash2, Package, Sparkles, Palette } from "lucide-react";
import { formatIDR, formatPurchaseUnit } from "../../utils/formatCurrency";
import type { Material, MaterialColor } from "../../types";

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
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
              <th className="px-4 py-3">Nama Material & Varian</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Satuan & Konversi</th>
              <th className="px-4 py-3 text-right">Harga Beli & Pokok</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {materials.map((m) => {
              const isFabric = Boolean(m.material_categories?.is_fabric);
              const colors = colorsByMaterial[m.id] || [];
              const hasMultiUom = Boolean(m.purchase_unit && Number(m.conversion_rate) > 1);
              const purchasePrice = Math.round(Number(m.price || 0) * Number(m.conversion_rate || 1));

              return (
                <tr
                  key={m.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  {/* Nama Material & Varian Warna */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      {isFabric ? (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0 mt-0.5 border border-emerald-200"
                          title="Bahan Kain"
                        >
                          <Sparkles className="h-4 w-4" />
                        </span>
                      ) : (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 shrink-0 mt-0.5 border border-slate-200"
                          title="Bahan Non-Kain / Aksesoris"
                        >
                          <Package className="h-4 w-4" />
                        </span>
                      )}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-foreground">{m.name}</p>
                          {m.brand && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                              {m.brand}
                            </span>
                          )}
                        </div>

                        {m.composition && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {m.composition}
                          </p>
                        )}

                        {/* Color chips / swatches if material has colors */}
                        {colors.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-0.5 font-medium">
                              <Palette className="h-2.5 w-2.5 text-primary" />
                              {colors.length} warna:
                            </span>
                            {colors.slice(0, 5).map((c) => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] text-foreground border border-border"
                                title={c.color_name}
                              >
                                <span
                                  className="h-2 w-2 rounded-full border border-black/10 shrink-0"
                                  style={{ backgroundColor: c.color_code || "#94a3b8" }}
                                />
                                <span className="max-w-[80px] truncate">{c.color_name}</span>
                              </span>
                            ))}
                            {colors.length > 5 && (
                              <span className="text-[10px] text-muted-foreground font-medium">
                                +{colors.length - 5} lainnya
                              </span>
                            )}
                          </div>
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

                  {/* Satuan & Konversi */}
                  <td className="px-4 py-3.5 text-muted-foreground font-mono text-xs">
                    <div>
                      <span className="font-semibold text-foreground">{m.unit}</span>
                      {hasMultiUom && (
                        <p className="text-[11px] font-sans text-muted-foreground mt-0.5">
                          1 {formatPurchaseUnit(m.purchase_unit)} = {m.conversion_rate} {m.unit}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Harga Beli Grosir vs Harga Pokok Satuan */}
                  <td className="px-4 py-3.5 text-right tabular-nums">
                    {hasMultiUom ? (
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {formatIDR(purchasePrice)} <span className="text-[10px] text-muted-foreground font-normal">/{formatPurchaseUnit(m.purchase_unit)}</span>
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
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        m.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {m.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>

                  {/* Aksi */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => onEdit(m)}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Edit material, harga & variasi warna"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(m)}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        title="Hapus material"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
