import { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileImage,
  ExternalLink,
  Check,
  AlertCircle,
  Truck,
} from 'lucide-react';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';
import { supabase } from '../../lib/supabaseClient';
import type { SupplierPurchase, Staff } from '../../types';

interface SupplierProofModalProps {
  open: boolean;
  onClose: () => void;
  purchase: SupplierPurchase | null;
  staffList: Staff[];
  onUploadProof: (purchaseId: string, proofUrl: string, uploadedBy?: string) => Promise<void>;
}

export default function SupplierProofModal({
  open,
  onClose,
  purchase,
  staffList,
  onUploadProof,
}: SupplierProofModalProps) {
  const [proofUrl, setProofUrl] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open || !purchase) return null;

  const handleFileUpload = async (file: File) => {
    try {
      setUploading(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `supplier_proof_${purchase.id}_${Date.now()}.${fileExt}`;
      const filePath = `supplier-proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('receipts').getPublicUrl(filePath);

      setProofUrl(publicUrl);
    } catch (err) {
      console.error('Gagal upload bukti nota supplier:', err);
      setError(err instanceof Error ? err.message : 'Gagal mengunggah foto bukti/nota.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofUrl.trim()) {
      setError('Mohon upload foto bukti nota atau masukkan URL bukti.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onUploadProof(purchase.id, proofUrl.trim(), uploadedBy || undefined);
      onClose();
    } catch (err) {
      console.error('Gagal menyimpan bukti nota:', err);
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Upload Nota Supplier
              </h2>
              <p className="text-xs text-muted-foreground">
                {purchase.supplier_name} • #{purchase.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Upload Area */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Foto Nota / Bukti Transfer & Surat Jalan <span className="text-rose-500">*</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            {proofUrl ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/30 p-3">
                <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 min-w-0">
                  <FileImage className="h-4 w-4 shrink-0" />
                  <span className="truncate font-medium">Nota berhasil di-upload</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                    title="Buka foto"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setProofUrl('')}
                    className="p-1 text-rose-600 hover:text-rose-800"
                    title="Hapus / ganti"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center hover:border-primary/60 hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {uploading ? 'Mengunggah file...' : 'Klik untuk upload foto nota/surat jalan'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Format PNG, JPG, JPEG (Maks. 5MB)
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* Staf Pengupload */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Staf yang Mengunggah (Opsional)
            </label>
            <select
              value={uploadedBy}
              onChange={(e) => setUploadedBy(e.target.value)}
              className={inputClass}
            >
              <option value="">-- Pilih Staf --</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role || 'Staf'})
                </option>
              ))}
            </select>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting || uploading || !proofUrl}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Check className="h-4 w-4" />
              {submitting ? 'Menyimpan...' : 'Simpan Bukti Nota'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
