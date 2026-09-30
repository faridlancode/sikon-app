/**
 * Memformat angka menjadi format mata uang Rupiah (IDR).
 * Contoh: 1500000 -> "Rp1.500.000"
 */
export function formatIDR(
  value: number | string | null | undefined,
  { withDecimals }: { withDecimals?: boolean } = {}
) {
  const number = Number(value) || 0;
  const shouldShowDecimals = withDecimals !== undefined ? withDecimals : number % 1 !== 0;

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: shouldShowDecimals ? 2 : 0,
    maximumFractionDigits: shouldShowDecimals ? 2 : 0,
  }).format(number);
}

export function formatIDRInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? Math.round(value) : parseIDRInput(value);
  return num > 0 ? formatIDR(num, { withDecimals: false }) : "";
}

export function parseIDRInput(value: number | string | null | undefined): number {
  if (typeof value === "number") return Math.round(value) || 0;
  const digits = String(value ?? "").replace(/\D/g, "");
  return Number(digits) || 0;
}

/**
 * Parsing input string yang mengandung koma atau titik desimal ke float number.
 * Contoh: "2,86" -> 2.86, "Rp 2,86" -> 2.86, "20.000" -> 20000, "20.000,50" -> 20000.5
 */
export function parseDecimalInput(value: number | string | null | undefined): number {
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  if (!value) return 0;

  let str = String(value).trim().replace(/[^\d.,]/g, "");
  if (!str) return 0;

  // Case 1: Koma dan Titik hadir bersamaan (misal: "20.000,50" atau "20,000.50")
  if (str.includes(".") && str.includes(",")) {
    const lastDot = str.lastIndexOf(".");
    const lastComma = str.lastIndexOf(",");
    if (lastComma > lastDot) {
      // Standar Indonesia: 20.000,50
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Standar US: 20,000.50
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Hanya koma tunggal, misal: "2,86" -> desimal
    str = str.replace(",", ".");
  } else if (str.includes(".")) {
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      // Banyak titik: ribuan, misal "1.000.000"
      str = str.replace(/\./g, "");
    } else {
      // Titik tunggal: jika tepat 3 digit dan angka depan >= 1 (misal 20.000 atau 1.000), anggap ribuan.
      // Selain itu (misal 2.86 atau 0.50 atau 12.5), anggap desimal.
      const parts = str.split(".");
      if (parts[1].length === 3 && Number(parts[0]) >= 1) {
        str = str.replace(".", "");
      }
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Format nama satuan kemasan grosir agar ramah UI (misal: cone_besar -> Cone Besar)
 */
export function formatPurchaseUnit(unit) {
  if (!unit) return "";
  const map = {
    pack: "Pack",
    roll: "Roll",
    gross: "Gross",
    lusin: "Lusin",
    cone_besar: "Cone Besar",
    cone_kecil: "Cone Kecil",
    dus: "Dus",
    box: "Box",
    ikat: "Ikat",
  };
  const key = String(unit).toLowerCase().trim();
  return map[key] || String(unit).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
