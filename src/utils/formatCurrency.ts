/**
 * Memformat angka menjadi format mata uang Rupiah (IDR).
 * Contoh: 1500000 -> "Rp1.500.000"
 */
export function formatIDR(value, { withDecimals = false } = {}) {
  const number = Number(value) || 0;

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(number);
}

export function formatIDRInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? formatIDR(digits) : "";
}

export function parseIDRInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return Number(digits) || 0;
}

/**
 * Versi ringkas untuk angka besar di kartu KPI, mis. Rp12,4 Jt
 */
export function formatIDRCompact(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);

  if (abs >= 1_000_000_000) {
    return `Rp${(number / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  }
  if (abs >= 1_000_000) {
    return `Rp${(number / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} Jt`;
  }
  return formatIDR(number);
}
