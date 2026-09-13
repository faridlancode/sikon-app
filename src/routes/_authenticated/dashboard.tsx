import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCompactIDR,
  formatIDR,
  RANGE_OPTIONS,
  resolveRange,
  type RangeValue,
} from "@/lib/finance";
import { listTransactions, type Transaction } from "@/lib/transactions.functions";

const RANGE_VALUES = RANGE_OPTIONS.map((o) => o.value);

const PIE_COLORS = [
  "oklch(0.511 0.196 274.2)",
  "oklch(0.62 0.16 200)",
  "oklch(0.65 0.15 155)",
  "oklch(0.72 0.16 80)",
  "oklch(0.62 0.2 25)",
  "oklch(0.6 0.17 320)",
  "oklch(0.55 0.06 260)",
  "oklch(0.7 0.1 120)",
];

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Arus Kas" },
      {
        name: "description",
        content: "Ringkasan pemasukan, pengeluaran, dan laba bersih beserta grafik tren.",
      },
      { property: "og:title", content: "Dashboard — Arus Kas" },
      {
        property: "og:description",
        content: "Ringkasan pemasukan, pengeluaran, dan laba bersih beserta grafik tren.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { range: RangeValue } => ({
    range: RANGE_VALUES.includes(search['range'] as RangeValue)
      ? (search['range'] as RangeValue)
      : "30d",
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const { range } = Route.useSearch();
  const navigate = useNavigate();
  const fetchTransactions = useServerFn(listTransactions);
  const { from, to } = resolveRange(range);

  const { data = [], isLoading } = useQuery({
    queryKey: ["transactions", from, to],
    queryFn: () => fetchTransactions({ data: { from, to } }),
  });

  const income = sum(data, "income");
  const expense = sum(data, "expense");

  return (
    <AppShell
      title="Dashboard"
      email={user.email ?? ""}
      range={range}
      onRangeChange={(value) => navigate({ to: "/dashboard", search: { range: value } })}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Total Pemasukan"
          value={income}
          icon={<ArrowUpRight className="size-4 text-success" />}
          tone="text-success"
        />
        <KpiCard
          label="Total Pengeluaran"
          value={expense}
          icon={<ArrowDownRight className="size-4 text-destructive" />}
          tone="text-destructive"
        />
        <KpiCard
          label="Laba Bersih"
          value={income - expense}
          icon={<Wallet className="size-4 text-primary" />}
          tone={income - expense >= 0 ? "text-foreground" : "text-destructive"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Tren Pemasukan vs Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {isLoading ? (
              <Empty text="Memuat data..." />
            ) : data.length === 0 ? (
              <Empty text="Belum ada transaksi pada periode ini." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={buildTrend(data)}>
                  <defs>
                    <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tickFormatter={(v: number) => formatCompactIDR(v)}
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted-foreground)"
                    width={56}
                  />
                  <Tooltip
                    formatter={(value: number) => formatIDR(value)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    name="Pemasukan"
                    dataKey="income"
                    stroke="var(--success)"
                    fill="url(#inc)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    name="Pengeluaran"
                    dataKey="expense"
                    stroke="var(--destructive)"
                    fill="url(#exp)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pengeluaran per Kategori</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {buildCategories(data).length === 0 ? (
              <Empty text="Belum ada pengeluaran pada periode ini." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={buildCategories(data)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {buildCategories(data).map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatIDR(value)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tracking-tight ${tone}`}>{formatIDR(value)}</p>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function sum(rows: Transaction[], type: Transaction["type"]) {
  return rows.filter((r) => r.type === type).reduce((acc, r) => acc + r.amount, 0);
}

function buildTrend(rows: Transaction[]) {
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const key = row.occurred_on;
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    bucket[row.type] += row.amount;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({
      label: key.slice(5).split("-").reverse().join("/"),
      ...value,
    }));
}

function buildCategories(rows: Transaction[]) {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== "expense") continue;
    buckets.set(row.category, (buckets.get(row.category) ?? 0) + row.amount);
  }
  return [...buckets.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
