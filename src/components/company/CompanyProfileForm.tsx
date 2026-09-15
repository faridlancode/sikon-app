import { useEffect, useState } from 'react';
import Card from '../ui/card';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';
import ImageUploadField from './ImageUploadField';
import type { CompanyProfile } from '../../types';

type CompanyProfileFormProps = {
  profile: CompanyProfile;
  onSave: (patch: Partial<CompanyProfile>) => Promise<unknown>;
  onUploadLogo: (file: File) => Promise<unknown>;
  onRemoveLogo: () => Promise<unknown>;
};

export default function CompanyProfileForm({ profile, onSave, onUploadLogo, onRemoveLogo }: CompanyProfileFormProps) {
  const [form, setForm] = useState({
    companyName: profile.companyName,
    address: profile.address,
    phone: profile.phone,
  });
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ companyName: profile.companyName, address: profile.address, phone: profile.phone });
  }, [profile.companyName, profile.address, profile.phone]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);

    if (!form.companyName.trim()) {
      setError('Nama perusahaan wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Profil Perusahaan</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Data ini akan dipakai sebagai identitas perusahaan di aplikasi dan dokumen resmi.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <ImageUploadField
          label="Logo Perusahaan"
          description="Ditampilkan di sidebar dan kop dokumen."
          imageUrl={profile.logoUrl}
          onUpload={onUploadLogo}
          onRemove={onRemoveLogo}
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Nama Perusahaan</span>
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            placeholder="mis. PT Konveksi Jaya Abadi"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Alamat</span>
          <textarea
            rows={3}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Alamat lengkap perusahaan"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">No. HP / Telepon</span>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="08xxxxxxxxxx"
            className={inputClass}
          />
        </label>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}
        {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">Tersimpan.</div>}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan Profil'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
