import { useMemo, useState, useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Layers,
  Search,
  Check,
  X,
  User,
  Scissors,
  Shirt,
  Warehouse,
  PackageOpen,
  PackageCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Flame,
  PackagePlus,
  RefreshCw,
} from "lucide-react";
import Button from "../ui/button";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import { useStaff } from "../../hooks/useStaff";
import FloorStockOutModal from "./FloorStockOutModal";
import type { StockMovement, Material, Staff } from "../../types";
import type {
  AssignmentWithBomStatus,
  AssignmentStockCheckResult,
  CuttingAssignmentWithFabricStatus,
  CuttingStockCheckResult,
} from "../../hooks/useWarehouseDispatch";

interface PendingRequestsTabProps {
  // Cutting assignments
  cuttingAssignments?: CuttingAssignmentWithFabricStatus[];
  onCheckCuttingStock?: (id: string) => Promise<CuttingStockCheckResult | null>;
  onDispatchCutting?: (id: string, recordedBy: string) => Promise<any>;

  // Sewing assignments
  sewingAssignments?: AssignmentWithBomStatus[];
  onCheckSewingStock?: (id: string) => Promise<AssignmentStockCheckResult | null>;
  onDispatchSewing?: (id: string, recordedBy: string) => Promise<any>;

  // Manual movements & Floor Stock
  pendingMovements: StockMovement[];
  materials?: Material[];
  loading: boolean;
  onConfirm: (movementId: string, takenBy?: string | null, recordedBy?: string | null) => Promise<void>;
  onCancel: (movementId: string) => Promise<void>;
  onRecordFloorStockOut?: (payload: {
    material_id: string;
    material_color_id?: string | null;
    qty: number;
    unit: string;
    taken_by?: string | null;
    recorded_by?: string | null;
    notes?: string;
  }) => Promise<void>;
  onRefresh?: () => void;
  staffList?: Staff[];
}

type SubTab = "cutting" | "sewing" | "manual";

// ── Card Pengeluaran Kain Potong ─────────────────────────────────────────────
function CuttingCard({
  assignment,
  staffList,
  onCheckStock,
  onDispatch,
}: {
  assignment: CuttingAssignmentWithFabricStatus;
  staffList: Staff[];
  onCheckStock?: (id: string) => Promise<CuttingStockCheckResult | null>;
  onDispatch?: (id: string, recordedBy: string) => Promise<any>;
}) {
  const [stockCheck, setStockCheck] = useState<CuttingStockCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedRecorder, setSelectedRecorder] = useState('');

  const orderData = assignment.order_items?.orders;
  const itemName = assignment.order_items?.name_item || 'Item';
  const itemQty = Number(assignment.order_items?.qty) || 0;

  const warehouseStaff = useMemo(
    () =>
      staffList.filter((s) => {
        const role = (s.role || '').toLowerCase();
        return s.is_active && (role.includes('gudang') || role.includes('warehouse') || role.includes('stok'));
      }),
    [staffList]
  );
  const defaultStaff = warehouseStaff.length > 0 ? warehouseStaff : staffList.filter((s) => s.is_active);

  useEffect(() => {
    if (defaultStaff[0]?.id && !selectedRecorder) {
      setSelectedRecorder(defaultStaff[0].id);
    }
  }, [defaultStaff, selectedRecorder]);

  async function handleToggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!stockCheck && onCheckStock) {
      setChecking(true);
      setError(null);
      try {
        const res = await onCheckStock(assignment.id);
        setStockCheck(res);
      } catch (e: any) {
        setError(e.message || 'Gagal memeriksa stok kain');
      } finally {
        setChecking(false);
      }
    }
  }

  async function handleDispatch() {
    if (!selectedRecorder) {
      setError('Pilih staf gudang yang menyerahkan kain');
      return;
    }
    if (!onDispatch) return;
    setDispatching(true);
    setError(null);
    try {
      await onDispatch(assignment.id, selectedRecorder);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Gagal menyerahkan kain');
    } finally {
      setDispatching(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800 shadow-2xs">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold">Kain berhasil diserahkan ke {assignment.staff?.name || 'Tukang Potong'}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{itemName} — {itemQty} pcs (Gate Check Terbuka)</p>
        </div>
      </div>
    );
  }

  if (assignment.alreadyDispatched) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 shadow-2xs opacity-75">
        <PackageCheck className="h-5 w-5 text-slate-400 shrink-0" />
        <div>
          <p className="font-semibold text-slate-700">{itemName} → {assignment.staff?.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{itemQty} pcs • Kain sudah diserahkan</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />
          Kain Sudah Diserahkan
        </span>
      </div>
    );
  }

  const allSufficient = stockCheck?.all_sufficient ?? null;

  return (
    <div
      className={`rounded-xl border shadow-2xs overflow-hidden transition-all ${
        allSufficient === false
          ? 'border-amber-300 bg-amber-50/40'
          : allSufficient === true
          ? 'border-emerald-300 bg-emerald-50/30'
          : 'border-border bg-white'
      }`}
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50/80 transition cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
              <Scissors className="h-3 w-3 mr-1" /> POTONG
            </span>
            <span className="font-mono text-xs font-bold text-primary">
              {orderData?.order_id || 'ORDER'}
            </span>
            <span className="text-sm font-semibold text-slate-900 truncate">
              {itemName}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <User className="h-3 w-3 text-slate-400" />
              Tukang Potong: <strong>{assignment.staff?.name || '-'}</strong>
            </span>
            <span>•</span>
            <span>Target: <strong>{itemQty} pcs</strong></span>
            <span>•</span>
            <span>Order: {orderData?.customer_name || 'Pelanggan'}</span>
          </div>
        </div>

        {/* Status indicator on right */}
        {allSufficient === true ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Stok Kain Siap
          </span>
        ) : allSufficient === false ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 shrink-0 border border-rose-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Stok Kain Kurang
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> Klik cek stok kain
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-white/80 px-4 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {checking ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Memeriksa ketersediaan stok kain di rak...
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Rincian Kebutuhan Kain ({itemQty} pcs):
              </p>
              {stockCheck?.fabrics && stockCheck.fabrics.length > 0 ? (
                <div className="space-y-1.5">
                  {stockCheck.fabrics.map((fab, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                        fab.is_sufficient
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-rose-200 bg-rose-50/60'
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{fab.material_name}</span>
                        {fab.color_name && (
                          <span className="ml-1.5 text-slate-500">({fab.color_name})</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <span className="text-slate-600">
                          Butuh: <strong>{fab.needed_qty} {fab.unit}</strong>
                        </span>
                        <span className={`font-semibold ${fab.is_sufficient ? 'text-emerald-700' : 'text-rose-700'}`}>
                          Stok: {fab.stock_qty} {fab.unit}
                          {!fab.is_sufficient && (
                            <span className="ml-1 text-rose-600 font-bold">
                              (kurang {(fab.needed_qty - fab.stock_qty).toFixed(2)} {fab.unit})
                            </span>
                          )}
                        </span>
                        {fab.is_sufficient ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500 text-center">
                  Item ini tidak memiliki slot kain yang terdaftar pada order_item_fabrics.
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          {stockCheck && (
            allSufficient ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <label className="text-xs font-semibold text-slate-600 shrink-0">
                    Staf Gudang:
                  </label>
                  <select
                    value={selectedRecorder}
                    onChange={(e) => setSelectedRecorder(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary flex-1 max-w-xs"
                  >
                    <option value="">-- Pilih Staf Gudang --</option>
                    {defaultStaff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role || 'Gudang'})</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={dispatching || !selectedRecorder}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {dispatching ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Menyerahkan Kain...</>
                  ) : (
                    <><Check className="h-4 w-4" />Serahkan Kain ke Tukang Potong</>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-rose-700 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Stok kain tidak mencukupi. Penyerahan kain dikunci sampai stok direstock.
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  <PackagePlus className="h-3.5 w-3.5" />
                  Ajukan Restock di Tab Permintaan
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Card Pengeluaran Bahan Jahit (Worklog Penjahit) ──────────────────────────
function SewingCard({
  assignment,
  staffList,
  onCheckStock,
  onDispatch,
}: {
  assignment: AssignmentWithBomStatus;
  staffList: Staff[];
  onCheckStock?: (id: string) => Promise<AssignmentStockCheckResult | null>;
  onDispatch?: (id: string, recordedBy: string) => Promise<any>;
}) {
  const [stockCheck, setStockCheck] = useState<AssignmentStockCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedRecorder, setSelectedRecorder] = useState('');

  const orderData = (assignment as any).order_items?.orders;
  const productData = (assignment as any).order_items?.products;
  const itemName = (assignment as any).order_items?.name_item || productData?.name || 'Item';
  const orderType: string = orderData?.order_type || 'prioritas';

  const warehouseStaff = useMemo(
    () =>
      staffList.filter((s) => {
        const role = (s.role || '').toLowerCase();
        return s.is_active && (role.includes('gudang') || role.includes('warehouse') || role.includes('stok'));
      }),
    [staffList]
  );
  const defaultStaff = warehouseStaff.length > 0 ? warehouseStaff : staffList.filter((s) => s.is_active);

  useEffect(() => {
    if (defaultStaff[0]?.id && !selectedRecorder) {
      setSelectedRecorder(defaultStaff[0].id);
    }
  }, [defaultStaff, selectedRecorder]);

  async function handleToggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!stockCheck && onCheckStock) {
      setChecking(true);
      setError(null);
      try {
        const res = await onCheckStock(assignment.id);
        setStockCheck(res);
      } catch (e: any) {
        setError(e.message || 'Gagal memeriksa stok bahan jahit');
      } finally {
        setChecking(false);
      }
    }
  }

  async function handleDispatch() {
    if (!selectedRecorder) {
      setError('Pilih staf gudang yang menyerahkan bahan');
      return;
    }
    if (!onDispatch) return;
    setDispatching(true);
    setError(null);
    try {
      await onDispatch(assignment.id, selectedRecorder);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Gagal menyerahkan bahan');
    } finally {
      setDispatching(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800 shadow-2xs">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold">Bahan berhasil diserahkan ke {(assignment.staff as any)?.name}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{itemName} — {assignment.assigned_qty} pcs</p>
        </div>
      </div>
    );
  }

  if (assignment.alreadyDispatched) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 shadow-2xs opacity-75">
        <PackageCheck className="h-5 w-5 text-slate-400 shrink-0" />
        <div>
          <p className="font-semibold text-slate-700">{itemName} → {(assignment.staff as any)?.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {assignment.assigned_qty} pcs • Bahan sudah diserahkan
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />
          Bahan Sudah Diserahkan
        </span>
      </div>
    );
  }

  const hasBom = (stockCheck?.materials?.length ?? 0) > 0;
  const allSufficient = stockCheck?.all_sufficient ?? null;

  return (
    <div
      className={`rounded-xl border shadow-2xs overflow-hidden transition-all ${
        allSufficient === false
          ? 'border-amber-300 bg-amber-50/40'
          : allSufficient === true
          ? 'border-emerald-300 bg-emerald-50/30'
          : 'border-border bg-white'
      }`}
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50/80 transition cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                orderType === 'prioritas'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-sky-100 text-sky-800'
              }`}
            >
              {orderType === 'prioritas' ? (
                <><Flame className="h-2.5 w-2.5 mr-0.5" />PRIORITAS</>
              ) : (
                <><Shirt className="h-2.5 w-2.5 mr-0.5" />SATUAN</>
              )}
            </span>
            <span className="font-mono text-xs font-bold text-primary">
              {orderData?.order_id || 'ORDER'}
            </span>
            <span className="text-sm font-semibold text-slate-900 truncate">
              {itemName}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <User className="h-3 w-3 text-slate-400" />
              Penjahit: <strong>{(assignment.staff as any)?.name || 'Penjahit'}</strong>
            </span>
            <span>•</span>
            <span>Alokasi: <strong>{assignment.assigned_qty} pcs</strong></span>
            <span>•</span>
            <span>Order: {orderData?.customer_name || 'Pelanggan'}</span>
          </div>
        </div>

        {allSufficient === true ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Bahan Siap
          </span>
        ) : allSufficient === false ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 shrink-0 border border-rose-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Stok Kurang
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
            <Package className="h-3.5 w-3.5" /> Klik cek BOM
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-white/80 px-4 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {checking ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Memeriksa ketersediaan stok aksesoris BOM...
            </div>
          ) : !hasBom ? (
            <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 p-3 text-xs text-slate-500 text-center">
              Produk ini tidak memiliki BOM material direct jahit (non-floor-stock).<br />
              Kancing dan benang didistribusikan via Floor Stock.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Kebutuhan Bahan Khusus {(assignment.staff as any)?.name} ({assignment.assigned_qty} pcs):
              </p>
              <div className="space-y-1.5">
                {stockCheck?.materials.map((mat) => (
                  <div
                    key={mat.material_id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                      mat.is_sufficient
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-rose-200 bg-rose-50/60'
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{mat.material_name}</span>
                      {mat.has_colors && mat.color_breakdown && mat.color_breakdown.length > 0 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Varian warna: {mat.color_breakdown.map((c) => `${c.color_name} (${c.stock_qty})`).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-slate-600">
                        Butuh: <strong>{mat.needed_qty} {mat.unit}</strong>
                      </span>
                      <span className={`font-semibold ${mat.is_sufficient ? 'text-emerald-700' : 'text-rose-700'}`}>
                        Stok: {mat.stock_qty} {mat.unit}
                        {!mat.is_sufficient && (
                          <span className="ml-1 text-rose-600 font-bold">
                            (kurang {mat.needed_qty - mat.stock_qty} {mat.unit})
                          </span>
                        )}
                      </span>
                      {mat.is_sufficient ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          {stockCheck && (
            allSufficient ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <label className="text-xs font-semibold text-slate-600 shrink-0">
                    Staf Gudang:
                  </label>
                  <select
                    value={selectedRecorder}
                    onChange={(e) => setSelectedRecorder(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary flex-1 max-w-xs"
                  >
                    <option value="">-- Pilih Staf Gudang --</option>
                    {defaultStaff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role || 'Gudang'})</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={dispatching || !selectedRecorder}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {dispatching ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Menyerahkan Bahan...</>
                  ) : (
                    <><PackageCheck className="h-4 w-4" />Serahkan Bahan ke Penjahit</>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-rose-700 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Stok bahan tidak mencukupi. Penyerahan dikunci sampai restock selesai.
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  <PackagePlus className="h-3.5 w-3.5" />
                  Ajukan Restock di Tab Permintaan
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab Utama: Barang Keluar ─────────────────────────────────────────────────
export default function PendingRequestsTab({
  cuttingAssignments = [],
  onCheckCuttingStock,
  onDispatchCutting,
  sewingAssignments = [],
  onCheckSewingStock,
  onDispatchSewing,
  pendingMovements,
  materials = [],
  loading,
  onConfirm,
  onCancel,
  onRecordFloorStockOut,
  onRefresh,
  staffList = [],
}: PendingRequestsTabProps) {
  const { activeStaff } = useStaff();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("cutting");
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showFloorStockModal, setShowFloorStockModal] = useState(false);

  // Per-movement staff selections
  const [takenByMap, setTakenByMap] = useState<Record<string, string>>({});
  const [recordedByMap, setRecordedByMap] = useState<Record<string, string>>({});

  const allStaff = staffList.length > 0 ? staffList : activeStaff;
  const gudangStaff = useMemo(() => allStaff.filter((s) => (s.role || '').toLowerCase().includes("gudang")), [allStaff]);
  const defaultGudang = gudangStaff.length > 0 ? gudangStaff : allStaff;

  // Filter pending non-order movements for manual tab
  const outgoingPendingMovements = useMemo(() => {
    return pendingMovements.filter((m) => m.movement_type === "out" && !m.sewing_assignment_id && !m.cutting_assignment_id);
  }, [pendingMovements]);

  const pendingCuttingCount = cuttingAssignments.filter((a) => !a.alreadyDispatched).length;
  const pendingSewingCount = sewingAssignments.filter((a) => !a.alreadyDispatched).length;

  const handleConfirmManualMovement = async (movement: StockMovement) => {
    const currentStock = movement.material_color_id
      ? Number(movement.material_colors?.stock_qty) || 0
      : Number(movement.materials?.stock_qty) || 0;

    // HARD BLOCK JIKA STOK KURANG
    if (currentStock < movement.qty) {
      setActionError(
        `Stok tidak mencukupi untuk "${movement.materials?.name}". Dibutuhkan ${movement.qty} ${movement.unit}, tersedia ${currentStock} ${movement.unit}. Silakan ajukan restock terlebih dahulu.`
      );
      return;
    }

    const takenBy = takenByMap[movement.id] || null;
    const recordedBy = recordedByMap[movement.id] || defaultGudang[0]?.id || null;

    setProcessingId(movement.id);
    setActionError(null);
    try {
      await onConfirm(movement.id, takenBy, recordedBy);
    } catch (err: any) {
      setActionError(err?.message || "Gagal mengonfirmasi pengeluaran stok.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelMovement = async (movementId: string) => {
    if (!window.confirm("Yakin ingin membatalkan permintaan pengeluaran stok ini?")) {
      return;
    }
    setProcessingId(movementId);
    setActionError(null);
    try {
      await onCancel(movementId);
    } catch (err: any) {
      setActionError(err?.message || "Gagal membatalkan permintaan stok.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive hover:opacity-80 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sub-Tab Navigation & Floor Stock Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-border shadow-xs">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveSubTab("cutting")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 transition cursor-pointer ${
              activeSubTab === "cutting"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "hover:text-slate-900"
            }`}
          >
            <Scissors className="h-4 w-4 text-purple-600" />
            <span>Kain Potong</span>
            {pendingCuttingCount > 0 && (
              <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.2 text-[10px] font-bold">
                {pendingCuttingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("sewing")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 transition cursor-pointer ${
              activeSubTab === "sewing"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "hover:text-slate-900"
            }`}
          >
            <Shirt className="h-4 w-4 text-blue-600" />
            <span>Bahan Jahit (Worklog)</span>
            {pendingSewingCount > 0 && (
              <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.2 text-[10px] font-bold">
                {pendingSewingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("manual")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 transition cursor-pointer ${
              activeSubTab === "manual"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "hover:text-slate-900"
            }`}
          >
            <Package className="h-4 w-4 text-slate-600" />
            <span>Mutasi Lainnya</span>
            {outgoingPendingMovements.length > 0 && (
              <span className="rounded-full bg-slate-200 text-slate-700 px-2 py-0.2 text-[10px] font-bold">
                {outgoingPendingMovements.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="gap-1.5 text-xs h-9"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          )}

          {onRecordFloorStockOut && (
            <Button
              type="button"
              onClick={() => setShowFloorStockModal(true)}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs h-9 shadow-xs cursor-pointer"
            >
              <PackageOpen className="h-4 w-4" />
              <span>+ Pengeluaran Floor Stock</span>
            </Button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: Kain Potong */}
      {activeSubTab === "cutting" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Daftar penugasan tukang potong yang membutuhkan penyerahan kain roll dari gudang.
            </p>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
              Memuat data kain potong...
            </div>
          ) : cuttingAssignments.length === 0 ? (
            <Card className="py-12 text-center">
              <Scissors className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">Tidak ada antrian serah kain potong</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Item potong baru akan muncul di sini setelah ditugaskan ke tukang potong.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {cuttingAssignments.map((assignment) => (
                <CuttingCard
                  key={assignment.id}
                  assignment={assignment}
                  staffList={allStaff}
                  onCheckStock={onCheckCuttingStock}
                  onDispatch={onDispatchCutting}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: Bahan Jahit (Worklog Penjahit) */}
      {activeSubTab === "sewing" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Daftar penugasan jahit per penjahit (Direct BOM: sleting, label, furing). Kancing dan benang dikeluarkan via Floor Stock.
            </p>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
              Memuat data penyerahan bahan jahit...
            </div>
          ) : sewingAssignments.length === 0 ? (
            <Card className="py-12 text-center">
              <Shirt className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">Tidak ada penugasan jahit aktif</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alokasi bahan akan otomatis muncul saat SPK didistribusikan ke penjahit.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {sewingAssignments.map((assignment) => (
                <SewingCard
                  key={assignment.id}
                  assignment={assignment}
                  staffList={allStaff}
                  onCheckStock={onCheckSewingStock}
                  onDispatch={onDispatchSewing}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: Mutasi Keluar Manual / Lainnya */}
      {activeSubTab === "manual" && (
        <div className="space-y-3">
          {outgoingPendingMovements.length === 0 ? (
            <Card className="py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-2 text-sm font-medium text-slate-700">Tidak ada pengeluaran manual tertunda</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pengeluaran Floor Stock atau operasional lainnya akan tercatat di sini jika ada status pending.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {outgoingPendingMovements.map((m) => {
                const isFabric = Boolean(
                  m.material_color_id || m.materials?.material_categories?.is_fabric
                );
                const currentStock = isFabric
                  ? Number(m.material_colors?.stock_qty) || 0
                  : Number(m.materials?.stock_qty) || 0;
                const isEnough = currentStock >= m.qty;

                return (
                  <Card key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{m.materials?.name}</span>
                        {m.material_colors && (
                          <span className="text-xs text-slate-500">({m.material_colors.color_name})</span>
                        )}
                        <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {m.qty} {m.unit}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{m.notes || 'Pengeluaran stok manual'}</p>
                      <p className="text-[11px] mt-1 text-slate-600">
                        Stok di rak: <strong className={isEnough ? "text-emerald-700" : "text-rose-700"}>{currentStock} {m.unit}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={processingId === m.id}
                        onClick={() => handleCancelMovement(m.id)}
                        className="text-xs text-rose-600"
                      >
                        Batal
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={processingId === m.id || !isEnough}
                        onClick={() => handleConfirmManualMovement(m)}
                        className={`text-xs font-semibold text-white ${
                          isEnough ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {processingId === m.id ? "..." : isEnough ? "Konfirmasi Keluar" : "Stok Kurang"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Pengeluaran Floor Stock */}
      {onRecordFloorStockOut && (
        <FloorStockOutModal
          open={showFloorStockModal}
          onClose={() => setShowFloorStockModal(false)}
          materials={materials}
          staffList={allStaff}
          onSubmit={async (payload) => {
            await onRecordFloorStockOut(payload);
            setShowFloorStockModal(false);
          }}
        />
      )}
    </div>
  );
}
