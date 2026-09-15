import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { CompanyProfile } from "../types";

const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  address: "",
  phone: "",
  logoUrl: null,
  stampUrl: null,
  signatureUrl: null,
  saldoAwal: 0,
};

const BUCKET = "company-assets";

export function useCompanySettings() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_settings")
      .select("company_name, address, phone, logo_url, stamp_url, signature_url, saldo_awal")
      .maybeSingle();

    if (!error && data) {
      setProfile({
        companyName: data.company_name || "",
        address: data.address || "",
        phone: data.phone || "",
        logoUrl: data.logo_url,
        stampUrl: data.stamp_url,
        signatureUrl: data.signature_url,
        saldoAwal: Number(data.saldo_awal) || 0,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function getUserId() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    return user.id;
  }

  /** Upsert sebagian field profil perusahaan (name/address/phone/saldoAwal/dll). */
  async function updateProfile(patch: Partial<CompanyProfile>) {
    const userId = await getUserId();

    const dbPatch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
    if (patch.companyName !== undefined) dbPatch.company_name = patch.companyName;
    if (patch.address !== undefined) dbPatch.address = patch.address;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    if (patch.saldoAwal !== undefined) dbPatch.saldo_awal = patch.saldoAwal;
    if (patch.logoUrl !== undefined) dbPatch.logo_url = patch.logoUrl;
    if (patch.stampUrl !== undefined) dbPatch.stamp_url = patch.stampUrl;
    if (patch.signatureUrl !== undefined) dbPatch.signature_url = patch.signatureUrl;

    const { error } = await supabase.from("company_settings").upsert(dbPatch);
    if (error) throw error;

    setProfile((prev) => ({ ...prev, ...patch }));
  }

  /** Kompatibilitas dengan pemakaian lama di kartu "Total Uang di Bank". */
  async function updateSaldoAwal(value: number) {
    await updateProfile({ saldoAwal: value });
  }

  /**
   * Upload file gambar (logo/stempel/ttd) ke Supabase Storage, lalu simpan URL publiknya
   * ke company_settings. field harus salah satu dari: 'logo' | 'stamp' | 'signature'.
   */
  async function uploadCompanyImage(field: "logo" | "stamp" | "signature", file: File) {
    const userId = await getUserId();
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/${field}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = data.publicUrl;

    if (field === "logo") await updateProfile({ logoUrl: publicUrl });
    else if (field === "stamp") await updateProfile({ stampUrl: publicUrl });
    else await updateProfile({ signatureUrl: publicUrl });

    return publicUrl;
  }

  /** Hapus gambar (set kolom terkait jadi null). File lama di storage dibiarkan saja. */
  async function removeCompanyImage(field: "logo" | "stamp" | "signature") {
    if (field === "logo") await updateProfile({ logoUrl: null });
    else if (field === "stamp") await updateProfile({ stampUrl: null });
    else await updateProfile({ signatureUrl: null });
  }

  return {
    profile,
    saldoAwal: profile.saldoAwal,
    loading,
    refetch: fetchSettings,
    updateProfile,
    updateSaldoAwal,
    uploadCompanyImage,
    removeCompanyImage,
  };
}
