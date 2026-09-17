import type { EmbroideryDetails, EmbroiderySpot } from "../types";

export const EMBROIDERY_PRESET_SPOTS = [
  "Dada Kiri",
  "Dada Kanan",
  "Dada Atas",
  "Dada Bawah",
  "Lengan Kiri",
  "Lengan Kanan",
  "Punggung",
  "Kerah",
  "Saku",
] as const;

export type PresetSpotName = (typeof EMBROIDERY_PRESET_SPOTS)[number];

export function getEmbroideryTotal(
  details: EmbroideryDetails | null | undefined
): number {
  if (!details || details.mode === "none") return 0;
  if (details.mode === "flat") {
    return Number(details.flatCost) || 0;
  }
  if (details.mode === "spots") {
    return (details.spots || []).reduce(
      (sum, s) => sum + (Number(s.cost) || 0),
      0
    );
  }
  return 0;
}
