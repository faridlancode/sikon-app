/**
 * Helper tanggal lokal bersama untuk mencegah pergeseran zona waktu UTC (WIB UTC+7)
 */

export function formatLocalDateISO(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO(): string {
  return formatLocalDateISO(new Date());
}

export function startOfMonthISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonthISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function formatDateID(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Nama bulan singkat (Jan, Feb, ...) dari tanggal ISO "YYYY-MM-DD" */
export function monthLabelID(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(date);
}

/** Key "YYYY-MM" untuk pengelompokan per bulan */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function startOfLastMonthISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

export function endOfLastMonthISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear(), d.getMonth(), 0));
}

export function startOfQuarterISO(d: Date = new Date()): string {
  const currentQuarter = Math.floor(d.getMonth() / 3);
  return formatLocalDateISO(new Date(d.getFullYear(), currentQuarter * 3, 1));
}

export function endOfQuarterISO(d: Date = new Date()): string {
  const currentQuarter = Math.floor(d.getMonth() / 3);
  return formatLocalDateISO(new Date(d.getFullYear(), (currentQuarter + 1) * 3, 0));
}

export function startOfYearISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear(), 0, 1));
}

export function endOfYearISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear(), 11, 31));
}

export function startOfLastYearISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear() - 1, 0, 1));
}

export function endOfLastYearISO(d: Date = new Date()): string {
  return formatLocalDateISO(new Date(d.getFullYear() - 1, 11, 31));
}
