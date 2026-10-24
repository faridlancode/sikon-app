/**
 * Helper tanggal lokal bersama dalam zona waktu WIB (Asia/Jakarta, UTC+7)
 * untuk mencegah pergeseran tanggal saat perangkat klien berjalan di zona waktu non-WIB.
 */


export function formatLocalDateISO(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayISO(): string {
  return formatLocalDateISO(new Date());
}

function getWibParts(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);

  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = parseInt(p.value, 10);
    }
  }
  return { year: map.year, month: map.month - 1, day: map.day };
}

export function startOfMonthISO(d: Date = new Date()): string {
  const { year, month } = getWibParts(d);
  const m = String(month + 1).padStart(2, '0');
  return `${year}-${m}-01`;
}

export function endOfMonthISO(d: Date = new Date()): string {
  const { year, month } = getWibParts(d);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const m = String(month + 1).padStart(2, '0');
  const day = String(lastDay).padStart(2, '0');
  return `${year}-${m}-${day}`;
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
