import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Package,
  User,
  FileText,
  ShoppingBag,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Material, Staff } from '../../types';

interface Order {
  id: string;
  order_id: string;
  customer_name: string;
}

interface DefectReturnModalProps {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  staffList: Staff[];
  onSuccess?: () => void;
}

type SubmitResult = {
  is_replaced: boolean;
  stock_request_created: boolean;
};

export default function DefectReturnModal({
  open,
  onClose,
  materials,
  staffList,
  onSuccess,
}: DefectReturnModalProps) {
  const [staffId, setStaffId] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [qty, setQty] = useState('1');
  const [defectReason, setDefectReason] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStaffId('');
      setReceivedBy('');
      setMaterialId('');
      setOrderId('');
      setQty('1');
      setDefectReason('');
      setOrders([]);
      setError('');
      setResult(null);
    }
  }, [open]);

  // Fetch active orders when tailor selected
  useEffect(() => {
    if (!staffId) {
      setOrders([]);
      setOrderId('');
      return;
    }
    async function fetchOrders() {
      setLoadingOrders(true);
      try {
        const { data } = await supabase
          .from('sewing_assignments')
          .select('order_items(orders(id, order_id, customer_name))')
          .eq('staff_id', staffId)
          .in('status', ['assigned', 'in_progress']);

        const seen = new Set<string>();
        const uniqueOrders: Order[] = [];
        ((data ?? []) as any[]).forEach((a) => {
          const o = a.order_items?.orders;
          if (o && !seen.has(o.id)) {
            seen.add(o.id);
            uniqueOrders.push(o);
          }
        });
        setOrders(uniqueOrders);
      } finally {
        setLoadingOrders(false);
      }
    }
    fetchOrders();
  }, [staffId]);

  // Non-floor-stock materials only (only materials that can be returned as defects)
  const returnableMaterials = useMemo(
    () => materials.filter((m) => m.is_active !== false),
    [materials]
  );

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === materialId),
    [materials, materialId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!staffId) { setError('Pilih penjahit yang mengembalikan barang'); return; }
    if (!receivedBy) { setError('Pilih staf gudang penerima'); return; }
    if (!materialId) { setError('Pilih material yang cacat'); return; }
    if (!defectReason.trim()) { setError('Alasan cacat wajib diisi'); return; }
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) { setError('Jumlah cacat harus lebih dari 0'); return; }

    setSubmitting(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('process_defect_material_return', {
        p_staff_id: staffId,
        p_received_by: receivedBy,
        p_material_id: materialId,
        p_qty: qtyNum,
        p_defect_reason: defectReason.trim(),
        p_order_id: orderId || null,
        p_sewing_assignment_id: null,
        p_material_color_id: null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setResult(data as SubmitResult);
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || 'Gagal memproses retur cacat');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const tailors = staffList.filter((s) => {
    const role = (s.role || '').toLowerCase();
    return s.is_active && (role.includes('jahit') || role.includes('penjahit') || role.includes('tailor'));
  });

  const warehouseStaff = staffList.filter((s) => {
    const role = (s.role || '').toLowerCase();
    return s.is_active && (role.includes('gudang') || role.includes('warehouse') || role.includes('stok'));
  });

  // If no role-based filter returns results, show all active staff
  const tailorList = tailors.length > 0 ? tailors : staffList.filter((s) => s.is_active);
  const warehouseList = warehouseStaff.length > 0 ? warehouseStaff : staffList.filter((s) => s.is_active);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Terima Material Cacat</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Catat retur aksesoris rusak dari penjahit ke gudang
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success State */}
        {result ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10">
            {result.is_replaced ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <p className="text-base font-bold text-slate-900">Retur Dicatat & Pengganti Diserahkan</p>
                <p className="mt-1.5 text-sm text-slate-600">
                  Material cacat berhasil dicatat sebagai susut.<br />
                  <strong>Barang pengganti langsung diberikan ke penjahit.</strong>
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <AlertTriangle className="h-7 w-7 text-amber-600" />
                </div>
                <p className="text-base font-bold text-slate-900">Retur Dicatat — Stok Habis</p>
                <p className="mt-1.5 text-sm text-slate-600">
                  Material cacat dicatat sebagai susut.<br />
                  <strong className="text-amber-800">Stok pengganti tidak tersedia.</strong><br />
                  Pengajuan restock SPJ darurat otomatis dibuat untuk purchasing.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg bg-slate-900 px-6 py-2 text-sm font-bold text-white hover:bg-slate-700 transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Penjahit */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <User className="inline h-3 w-3 mr-1" />
                  Penjahit yang Mengembalikan *
                </label>
                <select
                  value={staffId}
                  onChange={(e) => { setStaffId(e.target.value); setOrderId(''); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">— Pilih Penjahit —</option>
                  {tailorList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role || '-'})</option>
                  ))}
                </select>
              </div>

              {/* Staf Gudang */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <User className="inline h-3 w-3 mr-1" />
                  Staf Gudang yang Menerima *
                </label>
                <select
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">— Pilih Staf Gudang —</option>
                  {warehouseList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role || '-'})</option>
                  ))}
                </select>
              </div>

              {/* Order Terkait (Opsional) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <ShoppingBag className="inline h-3 w-3 mr-1" />
                  Order Terkait <span className="font-normal text-slate-400">(Opsional)</span>
                </label>
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  disabled={!staffId || loadingOrders}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">
                    {!staffId ? '— Pilih penjahit dulu —' : loadingOrders ? 'Memuat...' : '— Pilih Order (Opsional) —'}
                  </option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.order_id} — {o.customer_name}</option>
                  ))}
                </select>
              </div>

              {/* Material */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <Package className="inline h-3 w-3 mr-1" />
                  Material yang Cacat *
                </label>
                <select
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">— Pilih Material —</option>
                  {returnableMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.is_floor_stock ? '(Floor Stock)' : ''} — Stok: {m.stock_qty ?? 0} {m.unit}
                    </option>
                  ))}
                </select>
                {selectedMaterial && (
                  <p className={`mt-1 text-xs font-semibold ${
                    (selectedMaterial.stock_qty ?? 0) > 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    {(selectedMaterial.stock_qty ?? 0) > 0
                      ? `✓ Stok tersedia: ${selectedMaterial.stock_qty} ${selectedMaterial.unit} — pengganti bisa langsung diserahkan`
                      : '⚠ Stok habis — retur dicatat, pengajuan restock darurat akan dibuat otomatis'
                    }
                  </p>
                )}
              </div>

              {/* Jumlah Cacat */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Jumlah Cacat *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                  <span className="text-sm text-slate-500">
                    {selectedMaterial?.unit || 'pcs'}
                  </span>
                </div>
              </div>

              {/* Alasan Cacat */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <FileText className="inline h-3 w-3 mr-1" />
                  Alasan / Deskripsi Cacat *
                </label>
                <textarea
                  value={defectReason}
                  onChange={(e) => setDefectReason(e.target.value)}
                  placeholder="Contoh: sleting macet / rel melintir, kain sobek bagian jahitan, label printing buram..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  required
                />
              </div>

              {/* Info Box */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">ℹ Kebijakan Penanganan Material Cacat</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Barang cacat langsung dianggap <strong>susut/scrap (write-off)</strong></li>
                  <li>Jika stok tersedia, barang pengganti otomatis diserahkan</li>
                  <li>Jika stok habis, pengajuan restock darurat dibuat ke purchasing</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2 text-sm font-bold text-white hover:bg-rose-700 transition disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Memproses...</>
                ) : (
                  <>Proses Retur Cacat</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
