import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { formatIDR } from '../../../utils/formatCurrency';
import type { SalesCategoryMatrixItem } from '../../../types';

interface SalesCategoryMatrixTableProps {
  matrix?: SalesCategoryMatrixItem[];
  title?: string;
  subtitle?: string;
  isPrint?: boolean;
  showRevenue?: boolean;
}

export default function SalesCategoryMatrixTable({
  matrix = [],
  title = 'Rincian Pesanan per Sales & Kategori',
  subtitle,
  isPrint = false,
  showRevenue = true,
}: SalesCategoryMatrixTableProps) {
  // Aggregate matrix into distinct sales and categories
  const { categories, salesRows, categoryTotals, grandTotalPcs, grandTotalPrice } = useMemo(() => {
    const catSet = new Set<string>();
    const salesMap = new Map<
      string,
      {
        sales_name: string;
        categories: Record<string, { pcs: number; price: number }>;
        total_pcs: number;
        total_price: number;
      }
    >();

    for (const item of matrix) {
      const cat = item.category_name || 'Lainnya';
      const sales = item.sales_name || 'Tanpa Sales';
      catSet.add(cat);

      if (!salesMap.has(sales)) {
        salesMap.set(sales, {
          sales_name: sales,
          categories: {},
          total_pcs: 0,
          total_price: 0,
        });
      }

      const sData = salesMap.get(sales)!;
      if (!sData.categories[cat]) {
        sData.categories[cat] = { pcs: 0, price: 0 };
      }
      sData.categories[cat].pcs += Number(item.total_pcs) || 0;
      sData.categories[cat].price += Number(item.total_price) || 0;
      sData.total_pcs += Number(item.total_pcs) || 0;
      sData.total_price += Number(item.total_price) || 0;
    }

    const categories = Array.from(catSet).sort((a, b) => a.localeCompare(b));
    // Sort sales by total_pcs descending
    const salesRows = Array.from(salesMap.values()).sort(
      (a, b) => b.total_pcs - a.total_pcs || a.sales_name.localeCompare(b.sales_name)
    );

    // Calculate category totals
    const categoryTotals: Record<string, { pcs: number; price: number }> = {};
    let grandTotalPcs = 0;
    let grandTotalPrice = 0;

    for (const cat of categories) {
      categoryTotals[cat] = { pcs: 0, price: 0 };
    }

    for (const row of salesRows) {
      grandTotalPcs += row.total_pcs;
      grandTotalPrice += row.total_price;
      for (const cat of categories) {
        if (row.categories[cat]) {
          categoryTotals[cat].pcs += row.categories[cat].pcs;
          categoryTotals[cat].price += row.categories[cat].price;
        }
      }
    }

    return { categories, salesRows, categoryTotals, grandTotalPcs, grandTotalPrice };
  }, [matrix]);

  if (isPrint) {
    return (
      <div className="border border-border rounded-lg overflow-hidden break-inside-avoid">
        <div className="bg-muted px-3 py-1.5 font-bold text-xs uppercase border-b border-border flex justify-between items-center">
          <span>{title}</span>
          {subtitle && <span className="text-[10px] text-muted-foreground font-normal">{subtitle}</span>}
        </div>
        <table className="w-full text-xs">
          <thead className="border-b border-border text-muted-foreground bg-muted/10">
            <tr>
              <th className="py-1 px-2 text-center font-medium w-8">No</th>
              <th className="py-1 px-2.5 text-left font-medium">Nama Sales (CS)</th>
              {categories.map((cat) => (
                <th key={cat} className="py-1 px-2 text-right font-medium">
                  {cat}
                </th>
              ))}
              <th className="py-1 px-2.5 text-right font-bold text-foreground">Total Pcs</th>
              {showRevenue && (
                <th className="py-1 px-2.5 text-right font-bold text-foreground">Total Nilai</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {salesRows.length === 0 ? (
              <tr>
                <td
                  colSpan={categories.length + (showRevenue ? 3 : 2)}
                  className="py-3 text-center text-muted-foreground"
                >
                  Tidak ada data penjualan per kategori pada laporan ini.
                </td>
              </tr>
            ) : (
              salesRows.map((s, idx) => (
                <tr key={idx} className="hover:bg-muted/10">
                  <td className="py-1 px-2 text-center font-mono text-muted-foreground">{idx + 1}</td>
                  <td className="py-1 px-2.5 font-medium text-foreground">{s.sales_name}</td>
                  {categories.map((cat) => {
                    const pcs = s.categories[cat]?.pcs || 0;
                    return (
                      <td
                        key={cat}
                        className={`py-1 px-2 text-right font-mono ${
                          pcs > 0 ? 'text-foreground font-medium' : 'text-muted-foreground/50'
                        }`}
                      >
                        {pcs > 0 ? pcs : '-'}
                      </td>
                    );
                  })}
                  <td className="py-1 px-2.5 text-right font-mono font-bold text-foreground">
                    {s.total_pcs}
                  </td>
                  {showRevenue && (
                    <td className="py-1 px-2.5 text-right font-mono font-medium text-foreground">
                      {formatIDR(s.total_price)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {salesRows.length > 0 && (
            <tfoot className="border-t-2 border-border bg-muted/20 font-bold">
              <tr>
                <td colSpan={2} className="py-1.5 px-2.5 text-left uppercase text-[11px] font-black">
                  Total
                </td>
                {categories.map((cat) => (
                  <td key={cat} className="py-1.5 px-2 text-right font-mono font-bold text-foreground">
                    {categoryTotals[cat]?.pcs || 0}
                  </td>
                ))}
                <td className="py-1.5 px-2.5 text-right font-mono font-black text-foreground">
                  {grandTotalPcs}
                </td>
                {showRevenue && (
                  <td className="py-1.5 px-2.5 text-right font-mono font-black text-foreground">
                    {formatIDR(grandTotalPrice)}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  // Web / Screen UI Layout
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border bg-muted/40 px-4 py-3 gap-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {subtitle && <span>{subtitle}</span>}
          <span>
            {salesRows.length} CS &bull; {categories.length} Kategori
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-muted/20 text-muted-foreground">
            <tr>
              <th className="py-2.5 px-3 text-center font-medium w-10">No</th>
              <th className="py-2.5 px-3 text-left font-medium min-w-[120px]">Nama CS</th>
              {categories.map((cat) => (
                <th key={cat} className="py-2.5 px-3 text-right font-medium min-w-[70px]">
                  {cat}
                </th>
              ))}
              <th className="py-2.5 px-3 text-right font-bold text-foreground bg-primary/5 min-w-[80px]">
                Total Pcs
              </th>
              {showRevenue && (
                <th className="py-2.5 px-3 text-right font-bold text-foreground bg-primary/5 min-w-[110px]">
                  Total Nilai
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {salesRows.length === 0 ? (
              <tr>
                <td
                  colSpan={categories.length + (showRevenue ? 3 : 2)}
                  className="py-8 text-center text-muted-foreground"
                >
                  Belum ada transaksi per sales & kategori pada laporan ini.
                </td>
              </tr>
            ) : (
              salesRows.map((s, idx) => (
                <tr key={idx} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium text-foreground">{s.sales_name}</td>
                  {categories.map((cat) => {
                    const pcs = s.categories[cat]?.pcs || 0;
                    return (
                      <td
                        key={cat}
                        className={`py-2.5 px-3 text-right font-mono ${
                          pcs > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground/40'
                        }`}
                      >
                        {pcs > 0 ? pcs : '-'}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground bg-primary/5">
                    {s.total_pcs}
                  </td>
                  {showRevenue && (
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground bg-primary/5">
                      {formatIDR(s.total_price)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {salesRows.length > 0 && (
            <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
              <tr>
                <td colSpan={2} className="py-3 px-3 text-left uppercase text-xs font-black text-foreground">
                  TOTAL
                </td>
                {categories.map((cat) => (
                  <td key={cat} className="py-3 px-3 text-right font-mono font-bold text-foreground">
                    {categoryTotals[cat]?.pcs || 0}
                  </td>
                ))}
                <td className="py-3 px-3 text-right font-mono font-black text-foreground bg-primary/10">
                  {grandTotalPcs}
                </td>
                {showRevenue && (
                  <td className="py-3 px-3 text-right font-mono font-black text-foreground bg-primary/10">
                    {formatIDR(grandTotalPrice)}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
