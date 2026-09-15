import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import Button from '../ui/button';

const MAX_SIZE_MB = 2;

type ImageUploadFieldProps = {
  label: string;
  description?: string;
  imageUrl: string | null;
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  aspect?: 'square' | 'wide';
};

export default function ImageUploadField({
  label,
  description,
  imageUrl,
  onUpload,
  onRemove,
  aspect = 'square',
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');

    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (PNG/JPG/SVG).');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_SIZE_MB}MB.`);
      return;
    }

    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError('');
    try {
      await onRemove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus gambar.');
    } finally {
      setBusy(false);
    }
  }

  const boxClass = aspect === 'square' ? 'h-24 w-24' : 'h-24 w-40';

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}

      <div className="mt-2.5 flex items-center gap-4">
        <div
          className={`flex ${boxClass} flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted`}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : imageUrl ? (
            <img src={imageUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {imageUrl ? 'Ganti Gambar' : 'Upload Gambar'}
            </Button>
            {imageUrl && (
              <Button type="button" variant="danger" size="sm" disabled={busy} onClick={handleRemove}>
                <Trash2 className="h-3.5 w-3.5" />
                Hapus
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">PNG/JPG/SVG, maks {MAX_SIZE_MB}MB.</p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  );
}
