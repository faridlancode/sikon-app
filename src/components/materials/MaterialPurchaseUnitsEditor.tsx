import { Plus, Trash2 } from "lucide-react";
import Button from "../ui/button";
import { inputClass } from "../ui/FormField";
import type { MaterialPurchaseUnit } from "../../types";

interface MaterialPurchaseUnitsEditorProps {
    baseUnit: string;
    units: MaterialPurchaseUnit[];
    onChange: (units: MaterialPurchaseUnit[]) => void;
}

function createUnit(isPrimary: boolean): MaterialPurchaseUnit {
    return {
        id: `unit-${Math.random().toString(36).slice(2, 10)}`,
        name: "",
        conversion_rate: 1,
        is_variable: false,
        is_primary: isPrimary,
        is_active: true,
    };
}

export default function MaterialPurchaseUnitsEditor({
    baseUnit,
    units,
    onChange,
}: MaterialPurchaseUnitsEditorProps) {
    function updateUnit(index: number, patch: Partial<MaterialPurchaseUnit>) {
        onChange(units.map((unit, unitIndex) => {
            if (unitIndex === index) return { ...unit, ...patch };
            return patch.is_primary ? { ...unit, is_primary: false } : unit;
        }));
    }

    function removeUnit(index: number) {
        const next = units.filter((_, unitIndex) => unitIndex !== index);
        if (units[index]?.is_primary && next.length > 0) next[0] = { ...next[0], is_primary: true };
        onChange(next);
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-foreground">Pilihan satuan beli</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Satuan utama dipakai sebagai tampilan stok tambahan jika konversinya tetap.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([...units, createUnit(units.length === 0)])}
                    className="shrink-0 gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah satuan
                </Button>
            </div>

            {units.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                    Belum ada kemasan khusus. Pengajuan dapat menggunakan satuan stok ({baseUnit}).
                </p>
            ) : (
                <div className="space-y-2">
                    {units.map((unit, index) => (
                        <div key={unit.id} className="grid grid-cols-1 gap-2 rounded-md border border-border bg-card p-3 sm:grid-cols-12 sm:items-end">
                            <label className="sm:col-span-3">
                                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Nama satuan</span>
                                <input
                                    value={unit.name}
                                    onChange={(event) => updateUnit(index, { name: event.target.value })}
                                    placeholder="mis. Cone besar"
                                    className={inputClass}
                                    required
                                />
                            </label>

                            <label className="sm:col-span-3">
                                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Isi kemasan</span>
                                <select
                                    value={unit.is_variable ? "variable" : "fixed"}
                                    onChange={(event) => updateUnit(index, {
                                        is_variable: event.target.value === "variable",
                                        conversion_rate: event.target.value === "variable" ? null : (unit.conversion_rate || 1),
                                    })}
                                    className={inputClass}
                                >
                                    <option value="fixed">Tetap</option>
                                    <option value="variable">Berubah-ubah</option>
                                </select>
                            </label>

                            {unit.is_variable ? (
                                <p className="sm:col-span-4 sm:pb-2 text-[11px] text-muted-foreground">
                                    Jumlah {baseUnit} dicatat saat barang diterima.
                                </p>
                            ) : (
                                <label className="sm:col-span-4">
                                    <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Isi per kemasan</span>
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-[11px] text-muted-foreground">1 {unit.name || "kemasan"} =</span>
                                        <input
                                            type="number"
                                            min="0.001"
                                            step="any"
                                            value={unit.conversion_rate ?? ""}
                                            onChange={(event) => updateUnit(index, {
                                                conversion_rate: event.target.value === "" ? null : Number(event.target.value),
                                            })}
                                            className={inputClass}
                                            required
                                        />
                                        <span className="shrink-0 text-[11px] font-medium text-foreground">{baseUnit}</span>
                                    </div>
                                </label>
                            )}

                            <div className="flex items-center justify-between gap-2 sm:col-span-2 sm:justify-end">
                                <label className="flex items-center gap-2 text-[11px] font-medium text-foreground">
                                    <input
                                        type="radio"
                                        name="primary-purchase-unit"
                                        checked={unit.is_primary}
                                        onChange={() => updateUnit(index, { is_primary: true })}
                                        className="h-4 w-4 accent-primary"
                                    />
                                    Satuan utama
                                </label>
                                <button
                                    type="button"
                                    onClick={() => removeUnit(index)}
                                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    title="Hapus satuan beli"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}