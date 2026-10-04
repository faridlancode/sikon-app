import React, { useState, useMemo } from 'react';
import {
  PackageCheck,
  Shuffle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  Flame,
  Shirt,
  Sparkles,
  SlidersHorizontal,
  UserCheck,
  Layers,
} from 'lucide-react';
import type { OrderItem, Staff, SewingAssignment } from '../../types';
import ManualSewingAssignModal from './ManualSewingAssignModal';

interface SewingQueueTabProps {
  pool: (OrderItem & {
    assigned_qty?: number;
    remaining_qty?: number;
    pool_status?: 'waiting' | 'partial' | 'distributed';
  })[];
  loading: boolean;
  staffList?: Staff[];
  assignments?: SewingAssignment[];
  onMarkReady?: (ids: string[]) => Promise<void>;
  onDistribute: (
    ids: string[] | null,
    notes: string | null,
    targetOrderType?: 'all' | 'satuan' | 'prioritas'
  ) => Promise<void>;
  onDistributePriority?: (
    orderId: string,
    manualStaffIds?: string[] | null,
    manualQuotas?: number[] | null,
    notes?: string | null
  ) => Promise<void>;
}

type ViewFilter = 'all' | 'prioritas' | 'satuan' | 'distributed';

interface PriorityGroup {
  orderId: string;
  orderNumber: string;
  customerName: string;
  orderType: string;
  items: (OrderItem & {
    assigned_qty?: number;
    remaining_qty?: number;
    pool_status?: 'waiting' | 'partial' | 'distributed';
  })[];
  totalOrderQty: number;
  totalAssignedQty: number;
  totalRemainingQty: number;
  isFullyDistributed: boolean;
}

export default function SewingQueueTab({
  pool,
  loading,
  staffList = [],
  assignments = [],
  onDistribute,
  onDistributePriority,
}: SewingQueueTabProps) {
  const [selectedSatuanIds, setSelectedSatuanIds] = useState<string[]>([]);
  const [distributingAll, setDistributingAll] = useState(false);
  const [distributingOrderId, setDistributingOrderId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  // Modal manual SPV state
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [selectedOrderForManual, setSelectedOrderForManual] = useState<PriorityGroup | null>(null);

  // Active tailors
  const activeTailors = useMemo(() => {
    return staffList.filter((s) => {
      const role = (s.role || '').toLowerCase();
      const isSewing =
        role.includes('jahit') || role.includes('sewing') || role.includes('penjahit');
      return s.is_active && (s.wage_type === 'piecework' || isSewing);
    });
  }, [staffList]);

  // Compute ongoing load per tailor (assigned - qc_passed for non-completed)
  const staffLoads = useMemo(() => {
    const loads: Record<string, number> = {};
    activeTailors.forEach((t) => {
      loads[t.id] = 0;
    });
    assignments
      .filter((a) => a.status !== 'completed')
      .forEach((a) => {
        const staffId = a.staff_id;
        const remain = Math.max(0, (Number(a.assigned_qty) || 0) - (Number(a.qc_passed_qty) || 0));
        loads[staffId] = (loads[staffId] || 0) + remain;
      });
    return loads;
  }, [assignments, activeTailors]);

  // Helper to compute system recommendation for a priority order
  const getRecommendation = (orderQty: number) => {
    if (activeTailors.length === 0 || orderQty <= 0) return null;

    const numTailors = Math.min(3, Math.max(1, Math.floor(orderQty / 5)));
    // Sort tailors: last_priority_assigned_at ASC nulls first, then current load ASC
    const sorted = [...activeTailors].sort((a, b) => {
      const timeA = a.last_priority_assigned_at ? new Date(a.last_priority_assigned_at).getTime() : 0;
      const timeB = b.last_priority_assigned_at ? new Date(b.last_priority_assigned_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      const loadA = staffLoads[a.id] || 0;
      const loadB = staffLoads[b.id] || 0;
      return loadA - loadB;
    });

    const chosen = sorted.slice(0, numTailors);
    const base = Math.floor(orderQty / numTailors);
    const remainder = orderQty - base * numTailors;

    return chosen.map((tailor, idx) => ({
      tailor,
      quota: base + (idx < remainder ? 1 : 0),
    }));
  };

  // Group pool into Priority Orders and Satuan Items
  const { priorityGroups, waitingPriorityCount, satuanItems, waitingSatuanCount, totalRemainingPcs, totalAssignedPcs } = useMemo(() => {
    const pMap = new Map<string, PriorityGroup>();
    const satList: typeof pool = [];
    let remPcs = 0;
    let assPcs = 0;

    pool.forEach((item) => {
      const itemQty = Number(item.qty) || 0;
      const assignedQty = Number(item.assigned_qty) || 0;
      const remainingQty = item.remaining_qty != null ? item.remaining_qty : Math.max(0, itemQty - assignedQty);

      remPcs += remainingQty;
      assPcs += assignedQty;

      const orderData = (item as any).orders;
      const orderType = orderData?.order_type || (itemQty >= 6 ? 'prioritas' : 'satuan');
      const orderId = (item.order_id as string) || (orderData?.id as string) || 'unknown';

      if (orderType === 'prioritas') {
        if (!pMap.has(orderId)) {
          pMap.set(orderId, {
            orderId,
            orderNumber: orderData?.order_id || 'ORDER',
            customerName: orderData?.customer_name || 'Pelanggan',
            orderType: 'prioritas',
            items: [],
            totalOrderQty: 0,
            totalAssignedQty: 0,
            totalRemainingQty: 0,
            isFullyDistributed: true,
          });
        }
        const g = pMap.get(orderId)!;
        g.items.push(item);
        g.totalOrderQty += itemQty;
        g.totalAssignedQty += assignedQty;
        g.totalRemainingQty += remainingQty;
        if (remainingQty > 0) {
          g.isFullyDistributed = false;
        }
      } else {
        satList.push(item);
      }
    });

    const pGroups = Array.from(pMap.values());
    const waitPCount = pGroups.filter((g) => !g.isFullyDistributed).length;
    const waitSCount = satList.filter((i) => (i.remaining_qty ?? 0) > 0).length;

    return {
      priorityGroups: pGroups,
      waitingPriorityCount: waitPCount,
      satuanItems: satList,
      waitingSatuanCount: waitSCount,
      totalRemainingPcs: remPcs,
      totalAssignedPcs: assPcs,
    };
  }, [pool]);

  // Satuan selection handlers
  const selectableSatuanItems = useMemo(
    () => satuanItems.filter((i) => (i.remaining_qty ?? (Number(i.qty) || 0)) > 0),
    [satuanItems]
  );

  const allSatuanSelected =
    selectableSatuanItems.length > 0 &&
    selectableSatuanItems.every((i) => selectedSatuanIds.includes(i.id as string));

  function toggleSatuanSelect(id: string, canSelect: boolean) {
    if (!canSelect) return;
    setSelectedSatuanIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAllSatuan() {
    if (allSatuanSelected) {
      setSelectedSatuanIds([]);
    } else {
      setSelectedSatuanIds(selectableSatuanItems.map((i) => i.id as string));
    }
  }

  // Action: Distribute Priority Order (Auto)
  async function handleDistributePriorityAuto(orderId: string) {
    if (!onDistributePriority) return;
    setDistributingOrderId(orderId);
    try {
      await onDistributePriority(orderId, null, null, notes || null);
      setNotes('');
      setShowNotes(false);
    } finally {
      setDistributingOrderId(null);
    }
  }

  // Action: Open Manual SPV Modal
  function handleOpenManualSPV(group: PriorityGroup) {
    setSelectedOrderForManual(group);
    setManualModalOpen(true);
  }

  // Action: Save Manual SPV Distribution
  async function handleManualAssignSubmit(
    orderId: string,
    staffIds: string[],
    quotas: number[],
    customNotes: string | null
  ) {
    if (!onDistributePriority) return;
    await onDistributePriority(orderId, staffIds, quotas, customNotes);
  }

  // Action: Distribute Satuan Pool
  async function handleDistributeSatuan() {
    if (satuanItems.length === 0) return;
    setDistributingAll(true);
    try {
      const idsToDistribute =
        selectedSatuanIds.length > 0
          ? selectedSatuanIds
          : selectableSatuanItems.map((i) => i.id as string);
      await onDistribute(idsToDistribute, notes || null, 'satuan');
      setSelectedSatuanIds([]);
      setNotes('');
      setShowNotes(false);
    } finally {
      setDistributingAll(false);
    }
  }

  // Filter conditions
  const showPrioritySection = viewFilter === 'all' || viewFilter === 'prioritas';
  const showSatuanSection = viewFilter === 'all' || viewFilter === 'satuan';
  const showDistributedOnly = viewFilter === 'distributed';

  return (
    <div className="space-y-6">
      {/* Top Metrics Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Antrian Jahit
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {totalRemainingPcs}{' '}
            <span className="text-sm font-normal text-muted-foreground">pcs sisa</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {waitingPriorityCount} order prioritas + {waitingSatuanCount} item satuan
          </p>
        </div>

        <div className="rounded-xl border border-rose-200/70 bg-linear-to-br from-rose-50/60 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
              ⭐ Order Prioritas
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <Flame className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-rose-900">
            {waitingPriorityCount}{' '}
            <span className="text-sm font-normal text-rose-600">order menunggu</span>
          </p>
          <p className="mt-0.5 text-xs text-rose-600 font-medium">
            Maks. 3 penjahit / min. 5 pcs per orang
          </p>
        </div>

        <div className="rounded-xl border border-sky-200/70 bg-linear-to-br from-sky-50/60 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-700">
              👕 Order Satuan
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Shirt className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-sky-900">
            {waitingSatuanCount}{' '}
            <span className="text-sm font-normal text-sky-600">item menunggu</span>
          </p>
          <p className="mt-0.5 text-xs text-sky-600 font-medium">
            Dibagi rata + Surcharge Rp 10.000/pcs
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200/70 bg-linear-to-br from-emerald-50/60 to-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Sudah Terdistribusi
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-900">
            {totalAssignedPcs}{' '}
            <span className="text-sm font-normal text-emerald-600">pcs terbagi</span>
          </p>
          <p className="mt-0.5 text-xs text-emerald-600 font-medium">
            Cek tab "Beban Penjahit" untuk progres QC
          </p>
        </div>
      </div>

      {/* Filter Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setViewFilter('all')}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Semua Antrian ({waitingPriorityCount + waitingSatuanCount})
            </button>
            <button
              onClick={() => setViewFilter('prioritas')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                viewFilter === 'prioritas'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-rose-500" />
              Prioritas ({waitingPriorityCount})
            </button>
            <button
              onClick={() => setViewFilter('satuan')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                viewFilter === 'satuan'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              <Shirt className="h-3.5 w-3.5 text-sky-500" />
              Satuan ({waitingSatuanCount})
            </button>
            <button
              onClick={() => setViewFilter('distributed')}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewFilter === 'distributed'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Riwayat Terdistribusi
            </button>
          </div>
        </div>

        {/* Global Notes Toggle */}
        <div className="flex items-center gap-2">
          {showNotes && (
            <input
              type="text"
              placeholder="Catatan distribusi batch (opsional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-60"
            />
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="Tambah catatan batch"
          >
            {showNotes ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>Catatan</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-12 text-center text-sm text-muted-foreground shadow-2xs">
          Memuat antrian jahit...
        </div>
      ) : (
        <div className="space-y-8">
          {/* ========================================================================= */}
          {/* 1. SECTION ORDER PRIORITAS                                               */}
          {/* ========================================================================= */}
          {showPrioritySection && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                    <Flame className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Antrian Order Prioritas (Total Qty $\ge 6$ pcs)
                  </h3>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                    {priorityGroups.filter((g) => !g.isFullyDistributed).length} Order
                  </span>
                </div>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Setiap order didistribusikan utuh ke maks. 3 penjahit dengan rotasi giliran adil
                </p>
              </div>

              {priorityGroups.filter((g) => !g.isFullyDistributed).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-muted-foreground">
                  Tidak ada order prioritas yang menunggu distribusi jahit.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {priorityGroups
                    .filter((g) => !g.isFullyDistributed)
                    .map((group) => {
                      const recs = getRecommendation(group.totalRemainingQty);
                      const isDistributing = distributingOrderId === group.orderId;

                      return (
                        <div
                          key={group.orderId}
                          className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                        >
                          <div className="space-y-3.5">
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                                    PRIORITAS
                                  </span>
                                  <span className="font-mono text-sm font-bold text-slate-900">
                                    {group.orderNumber}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                                  {group.customerName}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-semibold text-muted-foreground">
                                  Sisa Antri:
                                </span>
                                <p className="text-xl font-black text-rose-600">
                                  {group.totalRemainingQty}{' '}
                                  <span className="text-xs font-normal text-muted-foreground">
                                    / {group.totalOrderQty} pcs
                                  </span>
                                </p>
                              </div>
                            </div>

                            {/* Item breakdown */}
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                Item dalam pesanan ini:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {group.items.map((it) => {
                                  const prod = (it as any).products;
                                  const cost = prod?.sewing_cost_per_pcs
                                    ? `Rp ${Number(prod.sewing_cost_per_pcs).toLocaleString('id-ID')}`
                                    : '-';
                                  const rem = it.remaining_qty ?? (Number(it.qty) || 0);

                                  return (
                                    <div
                                      key={it.id}
                                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                                    >
                                      <span className="font-semibold text-slate-900">
                                        {it.name_item || prod?.name || 'Item'}
                                      </span>
                                      <span className="rounded bg-white px-1.5 py-0.2 text-[11px] font-bold text-primary border border-slate-200">
                                        {rem} pcs
                                      </span>
                                      <span className="text-[10px] text-slate-400">({cost}/pcs)</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* System recommendation banner */}
                            {recs && recs.length > 0 && (
                              <div className="rounded-xl border border-amber-200/80 bg-linear-to-r from-amber-50 to-orange-50/50 p-3 text-xs text-amber-900">
                                <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
                                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Saran Sistem (Rotasi Giliran Adil):</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-slate-700">
                                  {recs.map(({ tailor, quota }) => (
                                    <span
                                      key={tailor.id}
                                      className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-amber-200/60"
                                    >
                                      <span>{tailor.name}</span>
                                      <span className="text-amber-700 font-bold">({quota} pcs)</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Card Footer Actions */}
                          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => handleOpenManualSPV(group)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                              Sesuaikan / Manual SPV
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDistributePriorityAuto(group.orderId)}
                              disabled={isDistributing || group.totalRemainingQty <= 0}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              {isDistributing
                                ? 'Membagi...'
                                : `⚡ Bagikan Otomatis (${recs?.length || 1} Orang)`}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. SECTION ORDER SATUAN                                                   */}
          {/* ========================================================================= */}
          {showSatuanSection && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-700">
                    <Shirt className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Antrian Order Satuan (&lt; 6 pcs)
                  </h3>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                    {selectableSatuanItems.length} Item Menunggu
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDistributeSatuan}
                    disabled={distributingAll || selectableSatuanItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    {distributingAll
                      ? 'Membagi Rata...'
                      : selectedSatuanIds.length > 0
                      ? `Bagikan Terpilih (${selectedSatuanIds.length} item)`
                      : '⚡ Bagikan Rata Semua Satuan'}
                  </button>
                </div>
              </div>

              {/* Notice Banner */}
              <div className="flex items-center justify-between rounded-xl border border-sky-200/80 bg-sky-50/60 p-3 text-xs text-sky-900">
                <div className="flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-sky-600 shrink-0" />
                  <span>
                    Item satuan dibagikan rata ke <strong>seluruh penjahit aktif</strong>. Penjahit
                    menerima tarif standar <strong>+ Surcharge Rp 10.000 per pcs</strong>.
                  </span>
                </div>
              </div>

              {/* Table Satuan */}
              <div className="rounded-xl border border-border bg-white shadow-2xs overflow-hidden">
                {satuanItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    Tidak ada item satuan dalam antrian jahit.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={allSatuanSelected}
                              onChange={toggleAllSatuan}
                              disabled={selectableSatuanItems.length === 0}
                              className="h-4 w-4 rounded border-border accent-primary disabled:opacity-30 cursor-pointer"
                              title="Pilih semua item satuan"
                            />
                          </th>
                          <th className="px-4 py-3">Item</th>
                          <th className="px-4 py-3">Order</th>
                          <th className="px-4 py-3">Produk</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Terdistribusi</th>
                          <th className="px-4 py-3 text-right">Sisa Antri</th>
                          <th className="px-4 py-3 text-right">Tarif Dasar</th>
                          <th className="px-4 py-3 text-right">Tarif + Surcharge</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {satuanItems.map((item, idx) => {
                          const id = item.id as string;
                          const isSelected = selectedSatuanIds.includes(id);
                          const itemQty = Number(item.qty) || 0;
                          const assignedQty = Number(item.assigned_qty) || 0;
                          const remainingQty = item.remaining_qty ?? Math.max(0, itemQty - assignedQty);
                          const isFullyAssigned = remainingQty <= 0;
                          const orderData = (item as any).orders;
                          const productData = (item as any).products;
                          const baseCost = Number(productData?.sewing_cost_per_pcs) || 0;
                          const withSurcharge = baseCost + 10000;

                          return (
                            <tr
                              key={id}
                              className={`transition-colors ${
                                isFullyAssigned
                                  ? 'bg-slate-50/50 opacity-70 cursor-default'
                                  : 'cursor-pointer hover:bg-sky-50/50'
                              } ${isSelected ? 'bg-sky-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                              onClick={() => toggleSatuanSelect(id, !isFullyAssigned)}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isFullyAssigned}
                                  onChange={() => toggleSatuanSelect(id, !isFullyAssigned)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 rounded border-border accent-sky-600 disabled:opacity-30 cursor-pointer"
                                />
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {item.name_item || 'Item'}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <span className="font-mono font-bold text-sky-700">
                                  {orderData?.order_id || '-'}
                                </span>
                                <span className="ml-1 text-slate-500">
                                  ({orderData?.customer_name || 'Pelanggan'})
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700">
                                {productData?.name ?? '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-700">
                                {itemQty} pcs
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">
                                {assignedQty > 0 ? `${assignedQty} pcs` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                {remainingQty}{' '}
                                <span className="text-xs font-normal text-muted-foreground">pcs</span>
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-slate-500">
                                Rp {baseCost.toLocaleString('id-ID')}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-sky-700">
                                Rp {withSurcharge.toLocaleString('id-ID')}
                              </td>
                              <td className="px-4 py-3">
                                {isFullyAssigned ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Terdistribusi
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                    <AlertCircle className="h-3 w-3" />
                                    Menunggu ({remainingQty} sisa)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. SECTION RIWAYAT TERDISTRIBUSI                                          */}
          {/* ========================================================================= */}
          {showDistributedOnly && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Item yang Telah Selesai Didistribusikan
                </h3>
              </div>

              <div className="rounded-xl border border-border bg-white shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3">Order</th>
                        <th className="px-4 py-3">Tipe</th>
                        <th className="px-4 py-3 text-right">Total Qty</th>
                        <th className="px-4 py-3 text-right">Terdistribusi</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pool
                        .filter((i) => (i.remaining_qty ?? 0) <= 0)
                        .map((item) => (
                          <tr key={item.id} className="bg-slate-50/40">
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {item.name_item || 'Item'}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {(item as any).orders?.order_id} ({(item as any).orders?.customer_name})
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold">
                              {(item as any).orders?.order_type === 'prioritas' ? (
                                <span className="text-rose-700">⭐ Prioritas</span>
                              ) : (
                                <span className="text-sky-700">👕 Satuan</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {item.qty} pcs
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">
                              {item.assigned_qty} pcs
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Terbagi Penuh
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Supervisor Assignment Modal */}
      {manualModalOpen && selectedOrderForManual && (
        <ManualSewingAssignModal
          isOpen={manualModalOpen}
          onClose={() => {
            setManualModalOpen(false);
            setSelectedOrderForManual(null);
          }}
          order={selectedOrderForManual}
          staffList={staffList}
          staffLoads={staffLoads}
          onAssign={handleManualAssignSubmit}
        />
      )}
    </div>
  );
}
