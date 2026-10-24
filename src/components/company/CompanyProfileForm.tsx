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

import { formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';

export default function CompanyProfileForm({ profile, onSave, onUploadLogo, onRemoveLogo }: CompanyProfileFormProps) {
  const [form, setForm] = useState({
    companyName: profile.companyName,
    address: profile.address,
    phone: profile.phone,
    sewingSatuanSurcharge: formatIDRInput(profile.sewing_satuan_surcharge ?? 10000),
    poGateProduction: profile.po_gate_production ?? false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      companyName: profile.companyName,
      address: profile.address,
      phone: profile.phone,
      sewingSatuanSurcharge: formatIDRInput(profile.sewing_satuan_surcharge ?? 10000),
      poGateProduction: profile.po_gate_production ?? false,
    });
  }, [profile.companyName, profile.address, profile.phone, profile.sewing_satuan_surcharge, profile.po_gate_production]);

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
      await onSave({
        companyName: form.companyName,
        address: form.address,
        phone: form.phone,
        sewing_satuan_surcharge: parseIDRInput(form.sewingSatuanSurcharge) || 10000,
        po_gate_production: form.poGateProduction,
      });
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
      <h2 className="text-sm font-semibold text-foreground">Profil & Pengaturan Operasional</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Data identitas perusahaan dan parameter perhitungan produksi default.
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Tambahan Upah Jahit Satuan (Rp/pcs)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={form.sewingSatuanSurcharge}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sewingSatuanSurcharge: formatIDRInput(e.target.value),
                }))
              }
              placeholder="10.000"
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Surcharge otomatis untuk penjahit saat mengerjakan order satuan (&lt; 6 pcs). Default: Rp 10.000.
            </span>
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3.5 cursor-pointer hover:bg-muted/50 transition">
          <input
            type="checkbox"
            checked={form.poGateProduction}
            onChange={(e) => setForm((f) => ({ ...f, poGateProduction: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Produksi menunggu PO ditutup</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bila aktif, Rekap order hanya bisa dilakukan setelah PO ditutup, kecuali dilepas lebih awal dengan alasan.
            </p>
          </div>
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
