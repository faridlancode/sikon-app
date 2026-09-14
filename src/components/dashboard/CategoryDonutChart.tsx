import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';
import { formatIDR } from '../../utils/formatCurrency';

// Palet warna yang konsisten dengan aksen teal brand, gradasi ke arah slate/amber agar tiap slice terbedakan.
const COLORS = ['#0d9488', '#0891b2', '#f59e0b', '#64748b', '#fb7185', '#8b5cf6', '#22c55e', '#ec4899'];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-lg">
      <p className="font-medium text-slate-600">{item.name}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatIDR(item.value)}</p>
    </div>
  );
}

export default function CategoryDonutChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const hasData = data.length > 0;

  return (
    <Card className="p-5 lg:col-span-2">
      <h3 className="text-sm font-semibold text-slate-900">Alokasi Pengeluaran</h3>
      <p className="text-xs text-slate-400">Berdasarkan kategori</p>

      {hasData ? (
        <>
          <div className="relative mx-auto mt-2 h-52 w-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[11px] text-slate-400">Total</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">{formatIDR(total)}</p>
            </div>
          </div>

          <ul className="mt-5 space-y-2.5">
            {data.slice(0, 5).map((item, index) => (
              <li key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="ml-2 flex-shrink-0 font-medium tabular-nums text-slate-900">
                  {total > 0 ? Math.round((item.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-slate-500">Belum ada pengeluaran</p>
          <p className="mt-1 text-xs text-slate-400">Alokasi kategori akan muncul di sini.</p>
        </div>
      )}
    </Card>
  );
}
