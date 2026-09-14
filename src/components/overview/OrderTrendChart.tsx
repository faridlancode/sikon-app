import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';
import { formatIDR, formatIDRCompact } from '../../utils/formatCurrency';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-slate-500">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.dataKey}
          </span>
          <span className="font-semibold tabular-nums text-slate-900">
            {entry.dataKey === 'Nilai Order' ? formatIDR(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OrderTrendChart({ data }) {
  const hasData = data.length > 0;

  return (
    <Card className="p-5 lg:col-span-3">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Tren Order</h3>
          <p className="text-xs text-slate-400">Jumlah & nilai order, 6 bulan terakhir</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-sky-300" /> Jumlah Order
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-600" /> Nilai Order
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatIDRCompact(v)}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="left" dataKey="Jumlah Order" fill="#7dd3fc" radius={[4, 4, 0, 0]} barSize={28} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Nilai Order"
                stroke="#0d9488"
                strokeWidth={2}
                dot={{ r: 3, fill: '#0d9488' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-72 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-slate-500">Belum ada data order</p>
          <p className="mt-1 text-xs text-slate-400">Tambahkan order untuk melihat tren di sini.</p>
        </div>
      )}
    </Card>
  );
}
