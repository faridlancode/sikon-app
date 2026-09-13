export type TxType = "income" | "expense";

export const INCOME_CATEGORIES = [
  "Gaji",
  "Penjualan",
  "Investasi",
  "Bonus",
  "Lainnya",
] as const;

export const EXPENSE_CATEGORIES = [
  "Makanan",
  "Transportasi",
  "Tagihan",
  "Sewa",
  "Hiburan",
  "Kesehatan",
  "Pendidikan",
  "Lainnya",
] as const;

export const ALL_CATEGORIES = Array.from(
  new Set<string>([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]),
);

export function categoriesFor(type: TxType): readonly string[] {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCompactIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const RANGE_OPTIONS = [
  { value: "30d", label: "30 hari terakhir" },
  { value: "month", label: "Bulan ini" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "year", label: "Tahun ini" },
  { value: "all", label: "Semua waktu" },
] as const;

export type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function resolveRange(range: RangeValue): { from: string; to: string } {
  const now = new Date();
  const to = toISO(now);
  if (range === "all") return { from: "1970-01-01", to };
  if (range === "month")
    return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (range === "year") return { from: toISO(new Date(now.getFullYear(), 0, 1)), to };
  const days = range === "30d" ? 29 : 89;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: toISO(start), to };
}
