import React, { useState, useEffect } from 'react';
import { PlusCircle, Info, Calendar, DollarSign, Clock, HelpCircle, X } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { formatIDR, formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';
import type { FixedAssetClass } from '../../types';

interface FixedAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  booksStartDate: string | null;
  onSubmit: (payload: {
    name: string;
    assetClass: FixedAssetClass;
    acquisitionDate: string;
    cost: number;
    usefulLifeMonths: number;
    salvageValue?: number;
    paymentMethod?: string | null;
    accumulatedAtStart?: number;
    notes?: string | null;
  }) => Promise<string>;
}

const ASSET_CLASS_OPTIONS: { value: FixedAssetClass; label: string; defaultMonths: number; account: string }[] = [
  { value: 'equipment', label: 'Mesin & Peralatan', defaultMonths: 48, account: '1-2100' },
  { value: 'vehicle', label: 'Kendaraan', defaultMonths: 60, account: '1-2200' },
  { value: 'furniture', label: 'Perabot & Perlengkapan', defaultMonths: 48, account: '1-2300' },
  { value: 'building', label: 'Bangunan', defaultMonths: 240, account: '1-2400' },
];

export default function FixedAssetModal({
  isOpen,
  onClose,
  booksStartDate,
  onSubmit,
}: FixedAssetModalProps) {
  const [assetName, setAssetName] = useState('');
  const [assetClass, setAssetClass] = useState<FixedAssetClass>('equipment');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState<number>(48);
  const [salvageValue, setSalvageValue] = useState('');
  const [accumulatedAtStart, setAccumulatedAtStart] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When asset class changes, update suggested useful life
  const handleClassChange = (selectedClass: FixedAssetClass) => {
    setAssetClass(selectedClass);
    const opt = ASSET_CLASS_OPTIONS.find((c) => c.value === selectedClass);
    if (opt) {
      setUsefulLifeMonths(opt.defaultMonths);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAssetName('');
      setAssetClass('equipment');
      setAcquisitionDate(new Date().toISOString().slice(0, 10));
      setAcquisitionCost('');
      setUsefulLifeMonths(48);
      setSalvageValue('');
      setAccumulatedAtStart('');
      setPaymentMethod('cash');
      setNotes('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine if asset is "New" or "Pre-books Old Asset"
  const isOldAsset = booksStartDate ? acquisitionDate < booksStartDate : false;

  const costNum = parseIDRInput(acquisitionCost);
  const salvageNum = parseIDRInput(salvageValue);
  const accumNum = parseIDRInput(accumulatedAtStart);

  const depreciableBase = Math.max(0, costNum - salvageNum);
  const monthlyDepreciation = usefulLifeMonths > 0 ? Math.round(depreciableBase / usefulLifeMonths) : 0;
  const initialBookValue = Math.max(0, costNum - (isOldAsset ? accumNum : 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) {
      setError('Nama aset wajib diisi.');
      return;
    }
    if (!acquisitionDate) {
      setError('Tanggal perolehan wajib diisi.');
      return;
    }
    if (costNum <= 0) {
      setError('Harga perolehan harus lebih besar dari 0.');
      return;
    }
    if (usefulLifeMonths <= 0) {
      setError('Umur ekonomis harus lebih besar dari 0 bulan.');
      return;
    }
    if (salvageNum < 0) {
      setError('Nilai residu tidak boleh bernilai negatif.');
      return;
    }
    if (salvageNum >= costNum) {
      setError('Nilai residu tidak boleh melebihi atau sama dengan harga perolehan.');
      return;
    }
    if (isOldAsset && accumNum >= costNum) {
      setError('Akumulasi penyusutan awal tidak boleh melebihi harga perolehan.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit({
        name: assetName.trim(),
        assetClass,
        acquisitionDate,
        cost: costNum,
        usefulLifeMonths,
        salvageValue: salvageNum > 0 ? salvageNum : 0,
        accumulatedAtStart: isOldAsset && accumNum > 0 ? accumNum : 0,
        paymentMethod: !isOldAsset ? paymentMethod : null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Gagal mendaftarkan aset tetap.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
      <Card className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden shadow-xl border border-border my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Daftarkan Aset Tetap Baru</h3>
              <p className="text-xs text-muted-foreground">Pencatatan aset modal dan jadwal penyusutan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Asset Acquisition Timing Notice */}
          <div
            className={`p-3 rounded-lg text-xs border ${
              isOldAsset
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                : 'bg-primary/5 text-primary border-primary/20'
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold mb-0.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              {isOldAsset ? 'Aset Lama (Sebelum Mulai Pembukuan)' : 'Aset Baru (Pembelian Berjalan)'}
            </div>
            <p>
              {isOldAsset
                ? `Tanggal perolehan (${acquisitionDate}) lebih awal dari awal pembukuan (${booksStartDate}). Tidak akan memotong kas berjalan. Daftarkan sebelum tutup buku pertama.`
                : 'Aset diperoleh pada periode pembukuan aktif. Pengeluaran kas/bank akan dicatat secara otomatis ke jurnal umum.'}
            </p>
          </div>

          {/* Asset Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Nama Aset *</label>
            <input
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="Contoh: Mesin Cutting Otomatis, Pick-up Gran Max"
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Class & Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Klasifikasi Aset *</label>
              <select
                value={assetClass}
                onChange={(e) => handleClassChange(e.target.value as FixedAssetClass)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ASSET_CLASS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.account})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Tanggal Perolehan *
              </label>
              <input
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Acquisition Cost & Useful Life */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                Harga Perolehan (Rp) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={acquisitionCost}
                onChange={(e) => setAcquisitionCost(formatIDRInput(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  Masa Manfaat (Bulan) *
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ≈ {(usefulLifeMonths / 12).toFixed(1)} Tahun
                </span>
              </label>
              <input
                type="number"
                min="1"
                value={usefulLifeMonths === 0 ? '' : usefulLifeMonths}
                onChange={(e) => setUsefulLifeMonths(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Salvage Value & Payment Method / Accumulated at Start */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Nilai Residu / Sisa (Rp) <span className="text-muted-foreground font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={salvageValue}
                onChange={(e) => setSalvageValue(formatIDRInput(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* If New: Payment method selection */}
            {!isOldAsset && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Metode Pembayaran Kas/Bank *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      paymentMethod === 'cash'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    Kas Tunai (1-1100)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      paymentMethod === 'transfer'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    Kas Bank (1-1200)
                  </button>
                </div>
              </div>
            )}

            {/* If Old Asset: Accumulated at start */}
            {isOldAsset && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Akumulasi Penyusutan Awal (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={accumulatedAtStart}
                  onChange={(e) => setAccumulatedAtStart(formatIDRInput(e.target.value))}
                  placeholder="0 (jika belum disusutkan)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>

          {/* Live Calculation Preview Card */}
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5 text-xs">
            <div className="font-semibold text-foreground flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-primary" />
              Ringkasan Jadwal Penyusutan
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>Dasar Penyusutan:</span>
                <span className="font-medium text-foreground">{formatIDR(depreciableBase)}</span>
              </div>
              <div className="flex justify-between">
                <span>Nilai Buku Awal:</span>
                <span className="font-medium text-foreground">{formatIDR(initialBookValue)}</span>
              </div>
              <div className="flex justify-between col-span-2 pt-1 border-t border-border">
                <span className="font-medium text-foreground">Estimasi Beban Penyusutan / Bulan:</span>
                <span className="font-bold text-primary">{formatIDR(monthlyDepreciation)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Catatan / Spesifikasi Aset <span className="text-muted-foreground font-normal">(Opsional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Nomor seri mesin, pelat nomor kendaraan, lokasi penempatan, dsb."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Menyimpan...' : 'Daftarkan Aset'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
