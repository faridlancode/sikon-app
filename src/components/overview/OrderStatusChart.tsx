import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';

const COLORS = { Lunas: '#0d9488', 'Belum Lunas': '#f59e0b' };

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-lg">
      <p className="font-medium text-slate-600">{item.name}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{item.value} order</p>
    </div>
  );
}

export default function OrderStatusChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const hasData = total > 0;

  return (
    <Card className="p-5 lg:col-span-2">
      <h3 className="text-sm font-semibold text-slate-900">Status Order</h3>
      <p className="text-xs text-slate-400">Lunas vs Belum Lunas</p>

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
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[11px] text-slate-400">Total Order</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">{total}</p>
            </div>
          </div>

          <ul className="mt-5 space-y-2.5">
            {data.map((item) => (
              <li key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: COLORS[item.name] }} />
                  {item.name}
                </span>
                <span className="font-medium tabular-nums text-slate-900">
                  {item.value} ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-slate-500">Belum ada order</p>
          <p className="mt-1 text-xs text-slate-400">Status order akan muncul di sini.</p>
        </div>
      )}
    </Card>
  );
}
