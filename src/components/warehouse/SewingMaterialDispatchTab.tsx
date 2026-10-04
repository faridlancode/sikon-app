import React, { useEffect, useState, useMemo } from 'react';
import {
  PackageCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Box,
  User,
  ShoppingBag,
  Flame,
  Shirt,
  Layers,
  PackagePlus,
} from 'lucide-react';
import type { Staff } from '../../types';
import type {
  AssignmentWithBomStatus,
  AssignmentStockCheckResult,
} from '../../hooks/useWarehouseDispatch';

interface SewingMaterialDispatchTabProps {
  assignments: AssignmentWithBomStatus[];
  loading: boolean;
  staffList: Staff[];
  onCheckStock: (assignmentId: string) => Promise<AssignmentStockCheckResult | null>;
  onDispatch: (assignmentId: string, recordedByStaffId: string) => Promise<any>;
  onCreateStockRequest?: () => void;
  onRefresh: () => void;
}

interface AssignmentCardState {
  stockCheck: AssignmentStockCheckResult | null;
  checking: boolean;
  dispatching: boolean;
  expanded: boolean;
  error: string | null;
  success: boolean;
}

function AssignmentCard({
  assignment,
  staffList,
  onCheckStock,
  onDispatch,
}: {
  assignment: AssignmentWithBomStatus;
  staffList: Staff[];
  onCheckStock: (id: string) => Promise<AssignmentStockCheckResult | null>;
  onDispatch: (id: string, recordedBy: string) => Promise<any>;
}) {
  const [state, setState] = useState<AssignmentCardState>({
    stockCheck: null,
    checking: false,
    dispatching: false,
    expanded: false,
    error: null,
    success: false,
  });
  const [selectedRecorder, setSelectedRecorder] = useState('');

  const orderData = (assignment as any).order_items?.orders;
  const productData = (assignment as any).order_items?.products;
  const itemName = (assignment as any).order_items?.name_item || productData?.name || 'Item';
  const orderType: string = orderData?.order_type || 'prioritas';

  const warehouseStaff = useMemo(() =>
    staffList.filter((s) => {
      const role = (s.role || '').toLowerCase();
      return s.is_active && (role.includes('gudang') || role.includes('warehouse') || role.includes('stok'));
    }),
    [staffList]
  );

  async function handleToggleExpand() {
    if (state.expanded) {
      setState((prev) => ({ ...prev, expanded: false }));
      return;
    }
    setState((prev) => ({ ...prev, expanded: true, checking: true, error: null }));
    try {
      const result = await onCheckStock(assignment.id as string);
      setState((prev) => ({ ...prev, stockCheck: result, checking: false }));
    } catch (e: any) {
      setState((prev) => ({ ...prev, checking: false, error: e.message || 'Gagal memeriksa stok' }));
    }
  }

  async function handleDispatch() {
    if (!selectedRecorder) {
      setState((prev) => ({ ...prev, error: 'Pilih staf gudang yang menyerahkan bahan' }));
      return;
    }
    setState((prev) => ({ ...prev, dispatching: true, error: null }));
    try {
      await onDispatch(assignment.id as string, selectedRecorder);
      setState((prev) => ({ ...prev, dispatching: false, success: true }));
    } catch (e: any) {
      setState((prev) => ({ ...prev, dispatching: false, error: e.message || 'Gagal menyerahkan bahan' }));
    }
  }

  if (state.success) {
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
            {assignment.assigned_qty} pcs • Bahan sudah diserahkan sebelumnya
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />
          Sudah Diserahkan
        </span>
      </div>
    );
  }

  const hasBom = (state.stockCheck?.materials?.length ?? 0) > 0;
  const allSufficient = state.stockCheck?.all_sufficient ?? null;

  return (
    <div className={`rounded-xl border shadow-2xs overflow-hidden transition-all ${
      allSufficient === false
        ? 'border-amber-200 bg-amber-50/40'
        : allSufficient === true
        ? 'border-emerald-200 bg-emerald-50/30'
        : 'border-slate-200 bg-white'
    }`}>
      {/* Card Header */}
      <button
        type="button"
        onClick={handleToggleExpand}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-black/3 transition cursor-pointer"
      >
        {state.expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              orderType === 'prioritas'
                ? 'bg-rose-100 text-rose-800'
                : 'bg-sky-100 text-sky-800'
            }`}>
              {orderType === 'prioritas' ? (
                <><Flame className="h-2.5 w-2.5 mr-0.5" />PRIORITAS</>
              ) : (
                <><Shirt className="h-2.5 w-2.5 mr-0.5" />SATUAN</>
              )}
            </span>
            <span className="font-mono text-xs font-bold text-primary">
              {orderData?.order_id || '-'}
            </span>
            <span className="text-sm font-semibold text-slate-800 truncate">
              {itemName}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {(assignment.staff as any)?.name || 'Penjahit'} ({(assignment.staff as any)?.role || '-'})
            </span>
            <span className="flex items-center gap-1">
              <Box className="h-3 w-3" />
              {assignment.assigned_qty} pcs ditugaskan
            </span>
          </div>
        </div>

        {/* Status badge */}
        {state.checking ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
        ) : allSufficient === true ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            Stok Lengkap
          </span>
        ) : allSufficient === false ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 shrink-0">
            <AlertTriangle className="h-3 w-3" />
            Stok Kurang
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 shrink-0">Klik untuk cek stok</span>
        )}
      </button>

      {/* Expanded Detail */}
      {state.expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
          {state.error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {state.error}
            </div>
          )}

          {state.checking ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memeriksa ketersediaan stok...
            </div>
          ) : !hasBom ? (
            <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 p-3 text-xs text-slate-500 text-center">
              Produk ini tidak memiliki BOM material direct (non-floor-stock).<br />
              Tidak ada bahan yang perlu diserahkan dari gudang.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Kebutuhan Bahan ({assignment.assigned_qty} pcs):
              </p>
              <div className="space-y-1.5">
                {state.stockCheck?.materials.map((mat) => (
                  <div
                    key={mat.material_id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                      mat.is_sufficient
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-amber-200 bg-amber-50/60'
                    }`}
                  >
                    <span className="font-semibold text-slate-800">{mat.material_name}</span>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-slate-600">
                        Butuh: <strong>{mat.needed_qty} {mat.unit}</strong>
                      </span>
                      <span className={`font-semibold ${mat.is_sufficient ? 'text-emerald-700' : 'text-amber-700'}`}>
                        Stok: {mat.stock_qty} {mat.unit}
                        {!mat.is_sufficient && (
                          <span className="ml-1 text-amber-600 font-bold">
                            (kurang {mat.needed_qty - mat.stock_qty} {mat.unit})
                          </span>
                        )}
                      </span>
                      {mat.is_sufficient ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action: Dispatch / Restock */}
          {state.stockCheck && (
            allSufficient ? (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                <div className="flex-1 min-w-36">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Diserahkan oleh Staf Gudang
                  </label>
                  <select
                    value={selectedRecorder}
                    onChange={(e) => setSelectedRecorder(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Pilih Staf Gudang —</option>
                    {staffList.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role || '-'})</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={state.dispatching || !selectedRecorder}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {state.dispatching ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Menyerahkan...</>
                  ) : (
                    <><PackageCheck className="h-4 w-4" />Serahkan Bahan ke Penjahit</>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <p className="text-xs text-amber-800 font-medium">
                  ⚠ Stok tidak mencukupi. Serah terima ditunda sampai restock selesai.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition cursor-pointer"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  Ajukan Restock Gudang
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function SewingMaterialDispatchTab({
  assignments,
  loading,
  staffList,
  onCheckStock,
  onDispatch,
  onRefresh,
}: SewingMaterialDispatchTabProps) {
  const [filterDispatched, setFilterDispatched] = useState(false);

  const pendingCount = assignments.filter((a) => !a.alreadyDispatched).length;
  const dispatchedCount = assignments.filter((a) => a.alreadyDispatched).length;

  const displayed = filterDispatched
    ? assignments
    : assignments.filter((a) => !a.alreadyDispatched);

  // Group by order
  const groups = useMemo(() => {
    const map = new Map<string, { orderCode: string; customerName: string; orderType: string; items: AssignmentWithBomStatus[] }>();
    displayed.forEach((a) => {
      const orderData = (a as any).order_items?.orders;
      const orderId = orderData?.id || 'unknown';
      if (!map.has(orderId)) {
        map.set(orderId, {
          orderCode: orderData?.order_id || 'ORDER',
          customerName: orderData?.customer_name || 'Pelanggan',
          orderType: orderData?.order_type || 'prioritas',
          items: [],
        });
      }
      map.get(orderId)!.items.push(a);
    });
    return Array.from(map.entries());
  }, [displayed]);

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Menunggu Serah Bahan
            </p>
            <p className="mt-0.5 text-2xl font-black text-slate-900">
              {pendingCount}{' '}
              <span className="text-sm font-normal text-muted-foreground">penugasan</span>
            </p>
          </div>
          <div className="hidden sm:block h-10 w-px bg-slate-200" />
          <div className="hidden sm:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sudah Diserahkan
            </p>
            <p className="mt-0.5 text-xl font-bold text-emerald-700">
              {dispatchedCount}{' '}
              <span className="text-sm font-normal text-muted-foreground">penugasan</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 select-none">
            <input
              type="checkbox"
              checked={filterDispatched}
              onChange={(e) => setFilterDispatched(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            Tampilkan yang sudah diserahkan
          </label>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            ↺ Segarkan
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-300 mb-3" />
          Memuat penugasan jahit...
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
          <PackageCheck className="mx-auto h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-600">
            {filterDispatched ? 'Belum ada penugasan' : 'Semua bahan sudah diserahkan!'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bahan akan muncul di sini ketika ada penjahit yang sudah mendapat tugas jahit dan perlu menerima aksesoris/bahan dari gudang.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([orderId, group]) => (
            <div key={orderId} className="space-y-2">
              {/* Order Group Header */}
              <div className="flex items-center gap-2 px-1">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${
                  group.orderType === 'prioritas' ? 'bg-rose-100' : 'bg-sky-100'
                }`}>
                  {group.orderType === 'prioritas'
                    ? <Flame className="h-3.5 w-3.5 text-rose-700" />
                    : <Shirt className="h-3.5 w-3.5 text-sky-700" />
                  }
                </div>
                <span className="font-mono text-sm font-bold text-primary">
                  {group.orderCode}
                </span>
                <span className="font-semibold text-slate-700 text-sm">
                  — {group.customerName}
                </span>
                <span className="text-xs text-slate-400">
                  ({group.items.length} bundel jahit)
                </span>
              </div>

              {/* Assignment Cards */}
              <div className="space-y-2 pl-8">
                {group.items.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id as string}
                    assignment={assignment}
                    staffList={staffList}
                    onCheckStock={onCheckStock}
                    onDispatch={onDispatch}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
