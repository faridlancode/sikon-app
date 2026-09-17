import { Eye, Pencil, Trash2, Shirt, Layers } from "lucide-react";
import { formatIDR } from "../../utils/formatCurrency";
import type { ProductWithDetails } from "../../hooks/useProducts";

interface ProductsTableProps {
  products: ProductWithDetails[];
  onView: (product: ProductWithDetails) => void;
  onEdit: (product: ProductWithDetails) => void;
  onDelete: (product: ProductWithDetails) => void;
}

export default function ProductsTable({
  products,
  onView,
  onEdit,
  onDelete,
}: ProductsTableProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Shirt className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Tidak ada produk ditemukan
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tambahkan produk / resep BOM baru untuk memulai.
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
              <th className="px-4 py-3">Nama Model Produk</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 text-right">Potong</th>
              <th className="px-4 py-3 text-right">Jahit</th>
              <th className="px-4 py-3 text-right">HPP Dasar (Tanpa Kain)</th>
              <th className="px-4 py-3 text-right">Harga Standar</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {products.map((p) => {
              const cutting = Number(p.cutting_cost_per_pcs) || 0;
              const sewing = Number(p.sewing_cost_per_pcs) || 0;
              const fixedAccessories = (p.product_materials ?? []).reduce(
                (acc, line) => {
                  const price = line.materials?.price ?? 0;
                  return acc + (Number(line.quantity) || 0) * price;
                },
                0
              );
              const baseHpp = cutting + sewing + fixedAccessories;
              const slotsCount = p.product_fabric_slots?.length ?? 0;

              return (
                <tr
                  key={p.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <Shirt className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {slotsCount > 0 ? (
                            <span>{slotsCount} slot kain</span>
                          ) : (
                            <span>Tanpa kain</span>
                          )}
                          {p.description && (
                            <>
                              <span>·</span>
                              <span className="line-clamp-1 max-w-[200px]">
                                {p.description}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      <Layers className="h-3 w-3 text-muted-foreground" />
                      {p.product_categories?.name || "Tanpa Kategori"}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                    {formatIDR(cutting)}
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                    {formatIDR(sewing)}
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-foreground">
                    <div>
                      <span>{formatIDR(baseHpp)}</span>
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        + kain saat order
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums font-medium text-foreground">
                    {p.default_price && Number(p.default_price) > 0 ? (
                      formatIDR(p.default_price)
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                    >
                      {p.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => onView(p)}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Lihat katalog produk"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEdit(p)}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Edit produk & BOM"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        title="Hapus produk"
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
