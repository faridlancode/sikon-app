import { Pencil, Trash2, Package, Sparkles } from "lucide-react";
import { formatIDR } from "../../utils/formatCurrency";
import type { Material } from "../../types";

interface MaterialsTableProps {
  materials: Material[];
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
}

export default function MaterialsTable({
  materials,
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
              <th className="px-4 py-3">Nama Material</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Satuan</th>
              <th className="px-4 py-3 text-right">Harga Beli</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {materials.map((m) => {
              const isFabric = Boolean(m.material_categories?.is_fabric);
              return (
                <tr
                  key={m.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {isFabric ? (
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 shrink-0"
                          title="Bahan Kain"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0"
                          title="Bahan Non-Kain"
                        >
                          <Package className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{m.name}</p>
                        {m.composition && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {m.composition}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {m.material_categories?.name || "Tanpa Kategori"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground font-mono text-xs">
                    {m.unit}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-medium text-foreground">
                    {formatIDR(m.price)}
                  </td>
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
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => onEdit(m)}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Edit material & warna"
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
