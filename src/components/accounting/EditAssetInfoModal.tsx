import React, { useState, useEffect } from 'react';
import { X, Edit2, AlertCircle } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import type { FixedAssetRegisterItem } from '../../types';

interface EditAssetInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: FixedAssetRegisterItem | null;
  onSubmit: (assetId: string, name: string, notes: string | null) => Promise<void>;
}

export default function EditAssetInfoModal({
  isOpen,
  onClose,
  asset,
  onSubmit,
}: EditAssetInfoModalProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (asset) {
      setName(asset.name || '');
      setNotes(asset.notes || '');
      setError(null);
    }
  }, [asset, isOpen]);

  if (!isOpen || !asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama aset wajib diisi.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(asset.id, name.trim(), notes.trim() || null);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Gagal memperbarui informasi aset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-card border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Edit2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Ubah Nama / Catatan</h3>
              <p className="text-xs text-muted-foreground">Perbarui identitas aset tanpa mengubah nilai pembukuan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Nama Aset *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Contoh: Mesin Jahit Singer Heavy Duty"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Catatan / Keterangan</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="Catatan tambahan, lokasi fisik, kondisi, nomor seri, dll."
            />
          </div>

          <div className="pt-2 border-t border-border flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="min-w-[100px]"
            >
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
