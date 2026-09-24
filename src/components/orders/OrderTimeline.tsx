import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Circle,
  Scissors,
  Layers,
  Sparkles,
  ShieldCheck,
  PackageCheck,
  CreditCard,
  Truck,
  FileText,
  ClipboardCheck,
  User,
  Plus,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useOrderTimeline, type CuttingItemWithAssignment } from '../../hooks/useOrderTimeline';
import { useStaff } from '../../hooks/useStaff';
import type { OrderStageName, OrderStageStatus } from '../../types';

interface OrderTimelineProps {
  orderId: string;
  orderNumber?: string;
  onRefreshParent?: () => void;
}

interface StageConfig {
  key: OrderStageName;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  isAutomatic?: boolean;
  description: string;
}

const STAGES: StageConfig[] = [
  { key: 'quotation', label: 'Quotation', shortLabel: 'Quote', icon: FileText, description: 'Penawaran harga & kesepakatan spesifikasi awal dengan pelanggan.' },
  { key: 'rekap', label: 'Rekap Order', shortLabel: 'Rekap', icon: ClipboardCheck, description: 'Rekap PO, fiksasi ukuran, kain, dan detail produksi.' },
  { key: 'potong', label: 'Potong Kain', shortLabel: 'Potong', icon: Scissors, isAutomatic: true, description: 'Pemotongan pola kain per-item oleh tukang potong. Terhitung otomatis dari penandaan selesai potong tiap item.' },
  { key: 'bordir', label: 'Bordir / Sablon', shortLabel: 'Bordir', icon: Sparkles, description: 'Aplikasi bordir atau sablon. Menandai selesai tahap ini otomatis memasukkan item ke pool Antrian Jahit.' },
  { key: 'jahit', label: 'Jahit', shortLabel: 'Jahit', icon: Layers, isAutomatic: true, description: 'Proses penjahitan oleh tukang jahit. Terhitung otomatis dari penugasan & hasil lolos QC jahit.' },
  { key: 'finishing', label: 'Finishing', shortLabel: 'Finish', icon: Sparkles, description: 'Pembersihan sisa benang, kancing, lubang kancing, dan perapihan akhir.' },
  { key: 'qc', label: 'Quality Control', shortLabel: 'QC', icon: ShieldCheck, description: 'Pemeriksaan kelayakan kualitas jahitan, ukuran, dan kebersihan pakaian.' },
  { key: 'packaging', label: 'Packaging', shortLabel: 'Packing', icon: PackageCheck, description: 'Pelipatan, steam/setrika, hangtag, dan pengemasan plastik/dus.' },
  { key: 'pelunasan', label: 'Pelunasan', shortLabel: 'Lunas', icon: CreditCard, description: 'Konfirmasi pelunasan sisa pembayaran pesanan sebelum barang dikirim.' },
  { key: 'kirim', label: 'Pengiriman', shortLabel: 'Kirim', icon: Truck, description: 'Pesanan diserahkan ke kurir atau diambil oleh pelanggan.' },
];

export default function OrderTimeline({ orderId, orderNumber, onRefreshParent }: OrderTimelineProps) {
  const {
    stages,
    workLogs,
    cuttingItems,
    loading,
    actionLoading,
    error,
    fetchStages,
    fetchWorkLogs,
    fetchCuttingItems,
    toggleStage,
    logWork,
    assignCuttingItem,
    markCuttingItemDone,
    refetchAll,
  } = useOrderTimeline(orderId);

  const { activeStaff } = useStaff();

  // Active selected stage in stepper detail panel
  const [selectedStage, setSelectedStage] = useState<OrderStageName>('potong');

  // Modal / Form state for "+ Catat Log Kerja" (Finishing / QC / Packaging)
  const [showLogModal, setShowLogModal] = useState(false);
  const [logStaffId, setLogStaffId] = useState('');
  const [logQty, setLogQty] = useState<number>(0);
  const [logItemId, setLogItemId] = useState<string>('');
  const [logNotes, setLogNotes] = useState<string>('');
  const [logSubmitting, setLogSubmitting] = useState(false);

  // Form state for Potong assign & done
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  const [doneModalItem, setDoneModalItem] = useState<CuttingItemWithAssignment | null>(null);
  const [doneQty, setDoneQty] = useState<number>(0);
  const [doneNotes, setDoneNotes] = useState<string>('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (orderId) {
      refetchAll(orderId);
    }
  }, [orderId, refetchAll]);

  // Set default selected stage saat data pertama kali dimuat
  useEffect(() => {
    if (stages.length > 0) {
      // Prioritaskan stage yang in_progress, kalau tidak ada, stage pending pertama
      const inProgressStage = stages.find((s) => s.status === 'in_progress');
      if (inProgressStage) {
        setSelectedStage(inProgressStage.stage);
      } else {
        const pendingStage = stages.find((s) => s.status === 'pending');
        if (pendingStage) setSelectedStage(pendingStage.stage);
      }
    }
  }, [stages]);

  function notify(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }

  // Cari event data untuk stage tertentu
  function getStageEvent(stageKey: OrderStageName) {
    return stages.find((s) => s.stage === stageKey);
  }

  // Status stage helper
  function getStageStatus(stageKey: OrderStageName): OrderStageStatus {
    const ev = getStageEvent(stageKey);
    return ev?.status || 'pending';
  }

  // Handle manual toggle stage
  async function handleToggle(stageKey: OrderStageName, currentStatus: OrderStageStatus) {
    const isCurrentlyDone = currentStatus === 'done';
    const newDoneState = !isCurrentlyDone;

    try {
      await toggleStage(stageKey, newDoneState);
      notify(
        'success',
        `Stage ${stageKey.toUpperCase()} berhasil ditandai ${newDoneState ? 'Selesai' : 'Pending'}.`
      );
      if (onRefreshParent) onRefreshParent();
    } catch (e: any) {
      notify('error', e.message || 'Gagal mengubah status stage');
    }
  }

  // Handle submit log kerja (Finishing/QC/Packaging)
  async function handleSubmitLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logStaffId || logQty <= 0) {
      notify('error', 'Pilih staf dan masukkan jumlah qty yang valid');
      return;
    }

    setLogSubmitting(true);
    try {
      await logWork(
        selectedStage as 'finishing' | 'qc' | 'packaging',
        logStaffId,
        logQty,
        logItemId || null,
        logNotes || null
      );
      notify('success', `Log produktivitas ${selectedStage.toUpperCase()} (${logQty} pcs) berhasil disimpan.`);
      setShowLogModal(false);
      setLogStaffId('');
      setLogQty(0);
      setLogItemId('');
      setLogNotes('');
    } catch (e: any) {
      notify('error', e.message || 'Gagal menyimpan log kerja');
    } finally {
      setLogSubmitting(false);
    }
  }

  // Handle assign potong langsung dari timeline
  async function handleAssignCutting(item: CuttingItemWithAssignment) {
    if (!assignStaffId) {
      notify('error', 'Pilih tukang potong terlebih dahulu');
      return;
    }
    try {
      await assignCuttingItem(item.id, assignStaffId, assignNotes || undefined);
      notify('success', `Item ${item.name_item} berhasil di-assign ke tukang potong.`);
      setAssigningItemId(null);
      setAssignStaffId('');
      setAssignNotes('');
      if (onRefreshParent) onRefreshParent();
    } catch (e: any) {
      notify('error', e.message || 'Gagal assign item potong');
    }
  }

  // Handle selesai potong langsung dari timeline
  async function handleConfirmDoneCutting() {
    if (!doneModalItem) return;
    if (doneQty <= 0) {
      notify('error', 'Qty potong harus lebih dari 0');
      return;
    }
    try {
      await markCuttingItemDone(doneModalItem.id, doneQty, doneNotes || undefined);
      notify('success', `Item ${doneModalItem.name_item} selesai dipotong. Upah borongan tercatat otomatis.`);
      setDoneModalItem(null);
      if (onRefreshParent) onRefreshParent();
    } catch (e: any) {
      notify('error', e.message || 'Gagal menandai item selesai potong');
    }
  }

  const currentStageConfig = STAGES.find((s) => s.key === selectedStage) || STAGES[0];
  const currentStageEvent = getStageEvent(selectedStage);
  const currentStageStatus = currentStageEvent?.status || 'pending';

  // Filter logs untuk stage yang dipilih
  const currentStageLogs = workLogs.filter((l) => l.stage === selectedStage);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header Timeline */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Milestone &amp; Progres Produksi
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Alur 10 tahap pengerjaan pesanan dari Quotation hingga Pengiriman
            </p>
          </div>
        </div>

        {notification && (
          <div
            className={`text-xs font-semibold px-3 py-1 rounded-full border ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {notification.message}
          </div>
        )}
      </div>

      {/* Stepper Horizontal Scrollable */}
      <div className="overflow-x-auto px-5 py-4 scrollbar-thin">
        <div className="flex items-center min-w-[760px] justify-between relative">
          {STAGES.map((stg, index) => {
            const ev = getStageEvent(stg.key);
            const status = ev?.status || 'pending';
            const isSelected = selectedStage === stg.key;
            const Icon = stg.icon;

            return (
              <div key={stg.key} className="flex-1 flex items-center relative">
                {/* Garis penghubung ke stage berikutnya */}
                {index < STAGES.length - 1 && (
                  <div
                    className={`absolute top-4 left-1/2 w-full h-0.5 -z-0 transition-colors ${
                      status === 'done' ? 'bg-emerald-400' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Node Stepper */}
                <button
                  type="button"
                  onClick={() => setSelectedStage(stg.key)}
                  className={`relative z-10 flex flex-col items-center group w-full focus:outline-none transition-transform ${
                    isSelected ? 'scale-105' : 'hover:scale-102'
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      status === 'done'
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200'
                        : status === 'in_progress'
                        ? 'bg-amber-500 border-amber-500 text-white animate-pulse'
                        : 'bg-white border-slate-300 text-slate-400 group-hover:border-slate-400'
                    } ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  >
                    {status === 'done' ? (
                      <Check className="h-4 w-4 stroke-[3]" />
                    ) : status === 'in_progress' ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <span
                    className={`mt-1.5 text-[11px] font-semibold transition-colors text-center whitespace-nowrap ${
                      isSelected
                        ? 'text-primary font-bold'
                        : status === 'done'
                        ? 'text-emerald-700'
                        : status === 'in_progress'
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {stg.shortLabel}
                  </span>

                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium mt-0.5 ${
                      status === 'done'
                        ? 'bg-emerald-100 text-emerald-800'
                        : status === 'in_progress'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {status === 'done' ? 'Selesai' : status === 'in_progress' ? 'Proses' : 'Pending'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel Aksi & Detail Stage yang Dipilih */}
      <div className="border-t border-slate-100 bg-slate-50/50 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900">{currentStageConfig.label}</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                  currentStageStatus === 'done'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : currentStageStatus === 'in_progress'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                Status: {currentStageStatus === 'done' ? 'Selesai' : currentStageStatus === 'in_progress' ? 'Sedang Berjalan' : 'Belum Dimulai'}
              </span>
              {currentStageConfig.isAutomatic && (
                <span className="text-[10px] bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full font-medium">
                  ⚡ Otomatis Terhitung
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              {currentStageConfig.description}
            </p>
          </div>

          {/* Tombol aksi utama stage (hanya untuk manual stage) */}
          {!currentStageConfig.isAutomatic && (
            <div className="flex items-center gap-2">
              {['finishing', 'qc', 'packaging'].includes(selectedStage) && (
                <button
                  type="button"
                  onClick={() => setShowLogModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Catat Log Produktivitas
                </button>
              )}

              <button
                type="button"
                onClick={() => handleToggle(selectedStage, currentStageStatus)}
                disabled={actionLoading}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-50 ${
                  currentStageStatus === 'done'
                    ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {currentStageStatus === 'done' ? (
                  <>
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    Batalkan Status Selesai
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Tandai {currentStageConfig.label} Selesai
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Konten Spesifik per Stage */}

        {/* 1. KHUSUS STAGE POTONG: Rincian item order & aksi assign/done */}
        {selectedStage === 'potong' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Daftar Item &amp; Status Pemotongan ({cuttingItems.length} item)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Tandai item selesai untuk men-generate upah borongan tukang potong
              </span>
            </div>

            {cuttingItems.length === 0 ? (
              <div className="bg-white rounded-lg p-6 text-center text-xs text-muted-foreground border">
                Tidak ada item order.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5">Item Order</th>
                      <th className="px-3.5 py-2.5 text-right">Target Qty</th>
                      <th className="px-3.5 py-2.5">Tukang Potong</th>
                      <th className="px-3.5 py-2.5">Status Potong</th>
                      <th className="px-3.5 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cuttingItems.map((item) => {
                      const isDone = Boolean(item.cutting_completed_at);
                      const assign = item.cutting_assignments;
                      const isAssigningThis = assigningItemId === item.id;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="px-3.5 py-3">
                            <span className="font-semibold text-slate-900">{item.name_item}</span>
                            {item.products?.cutting_cost_per_pcs ? (
                              <span className="ml-2 text-[10px] text-slate-400">
                                (Tarif: Rp {Number(item.products.cutting_cost_per_pcs).toLocaleString('id-ID')}/pcs)
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3.5 py-3 text-right font-bold text-slate-900">
                            {item.qty} pcs
                          </td>
                          <td className="px-3.5 py-3">
                            {isAssigningThis ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={assignStaffId}
                                  onChange={(e) => setAssignStaffId(e.target.value)}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                >
                                  <option value="">-- Pilih Tukang Potong --</option>
                                  {activeStaff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleAssignCutting(item)}
                                  className="bg-primary text-white px-2 py-1 rounded text-[11px] font-semibold hover:bg-primary/90"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAssigningItemId(null)}
                                  className="text-slate-400 hover:text-slate-600 text-xs px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : assign?.staff ? (
                              <div className="flex items-center gap-1 text-slate-700">
                                <User className="h-3 w-3 text-slate-400" />
                                <span className="font-medium">{assign.staff.name}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Belum di-assign</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            {isDone ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold">
                                  <Check className="h-3 w-3 text-emerald-600" /> Selesai ({item.cutting_qty ?? item.qty} pcs)
                                </span>
                              </div>
                            ) : assign ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                                Ditugaskan
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-medium">
                                Antri
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            {isDone ? (
                              <span className="text-[11px] text-emerald-700 font-medium">
                                ✓ Upah tercatat
                              </span>
                            ) : assign ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDoneModalItem(item);
                                  setDoneQty(Number(item.qty) || 0);
                                  setDoneNotes('');
                                }}
                                className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Selesai Potong
                              </button>
                            ) : (
                              !isAssigningThis && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssigningItemId(item.id);
                                    setAssignStaffId('');
                                  }}
                                  className="inline-flex items-center gap-1 border border-primary text-primary hover:bg-primary/5 px-2.5 py-1 rounded text-xs font-semibold transition"
                                >
                                  <Scissors className="h-3 w-3" />
                                  Tugaskan
                                </button>
                              )
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
        )}

        {/* 2. KHUSUS STAGE BORDIR: Catatan otomasi pool jahit */}
        {selectedStage === 'bordir' && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-900 space-y-2">
            <div className="font-semibold flex items-center gap-2 text-indigo-950">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Alur Otomatisasi Bordir &amp; Antrian Jahit
            </div>
            <p>
              Saat bordir/sablon selesai dan Anda mengklik tombol <strong>"Tandai Bordir Selesai"</strong> di atas:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Semua item order ini akan langsung diberi stempel tanggal siap jahit.</li>
              <li>Item order langsung otomatis muncul di <strong>Worklog Produksi → Antrian Jahit</strong> untuk siap dibagikan ke tukang jahit.</li>
            </ul>
          </div>
        )}

        {/* 3. KHUSUS STAGE JAHIT: Ringkasan & Link ke Worklog Jahit */}
        {selectedStage === 'jahit' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-900 text-xs">Penugasan &amp; Beban Jahit</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Proses jahit dikelola secara terpusat dengan sistem pool &amp; beban kerja merata.
                </p>
              </div>
              <a
                href="/worklog"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Buka Worklog Jahit <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              Status stage Jahit pada timeline akan otomatis berubah menjadi:
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li><strong className="text-slate-800">Proses (in_progress):</strong> Saat ada item yang mulai ditugaskan ke penjahit.</li>
                <li><strong className="text-slate-800">Selesai (done):</strong> Saat semua item pesanan telah lolos pemeriksaan QC jahit (passed).</li>
              </ul>
            </div>
          </div>
        )}

        {/* 4. KHUSUS STAGE FINISHING / QC / PACKAGING: Log Produktivitas */}
        {['finishing', 'qc', 'packaging'].includes(selectedStage) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Log Produktivitas Staf ({currentStageLogs.length} entri)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Pekerja harian dicatat untuk pelaporan kinerja staf
              </span>
            </div>

            {currentStageLogs.length === 0 ? (
              <div className="bg-white rounded-lg p-5 text-center text-xs text-muted-foreground border">
                Belum ada log produktivitas yang dicatat untuk stage {currentStageConfig.label}.
                <button
                  type="button"
                  onClick={() => setShowLogModal(true)}
                  className="block mx-auto mt-2 text-primary font-semibold hover:underline"
                >
                  + Catat Sekarang
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-3.5 py-2">Staf</th>
                      <th className="px-3.5 py-2 text-right">Qty Dikerjakan</th>
                      <th className="px-3.5 py-2">Item Terkait</th>
                      <th className="px-3.5 py-2">Tanggal &amp; Waktu</th>
                      <th className="px-3.5 py-2">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentStageLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">
                          {log.staff?.name || 'Staf'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">
                          {log.qty} pcs
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600">
                          {log.order_items?.name_item || '-'}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500">
                          {new Date(log.logged_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500 italic">
                          {log.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Catat Log Produktivitas (Finishing / QC / Packaging) */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <form onSubmit={handleSubmitLog} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Catat Log Produktivitas — {currentStageConfig.label}
              </h4>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pilih Staf <span className="text-rose-500">*</span>
              </label>
              <select
                value={logStaffId}
                onChange={(e) => setLogStaffId(e.target.value)}
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Pilih Staf --</option>
                {activeStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.role ? `(${s.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qty Selesai Dikerjakan (pcs) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={logQty}
                onChange={(e) => setLogQty(Number(e.target.value))}
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Item Terkait (opsional)
              </label>
              <select
                value={logItemId}
                onChange={(e) => setLogItemId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Semua Item / Umum --</option>
                {cuttingItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name_item} ({item.qty} pcs)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan (opsional)
              </label>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="Misal: shift pagi, kelancaran packing, dll"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={logSubmitting || !logStaffId || logQty <= 0}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {logSubmitting ? 'Menyimpan...' : 'Simpan Log'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Konfirmasi Selesai Potong dari Timeline */}
      {doneModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Scissors className="h-5 w-5 text-emerald-600" />
                Konfirmasi Selesai Potong
              </h4>
              <button
                type="button"
                onClick={() => setDoneModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 bg-slate-50 p-3 rounded-lg text-xs text-slate-600">
              <p><strong className="text-slate-900">Item:</strong> {doneModalItem.name_item}</p>
              <p><strong className="text-slate-900">Target Qty:</strong> {doneModalItem.qty} pcs</p>
              <p><strong className="text-slate-900">Tukang Potong:</strong> {doneModalItem.cutting_assignments?.staff?.name || '-'}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qty Aktual Terpotong (pcs) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={doneQty}
                onChange={(e) => setDoneQty(Number(e.target.value))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan (opsional)
              </label>
              <input
                type="text"
                value={doneNotes}
                onChange={(e) => setDoneNotes(e.target.value)}
                placeholder="Pola beres, sisa bahan, dsb"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDoneModalItem(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDoneCutting}
                disabled={actionLoading || doneQty <= 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading ? 'Menyimpan...' : 'Konfirmasi Selesai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
