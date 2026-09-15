import { useCallback, useEffect, useSyncExternalStore } from "react";
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

type CompanySettingsState = {
  profile: CompanyProfile;
  loading: boolean;
};

let state: CompanySettingsState = { profile: EMPTY_PROFILE, loading: true };
let hasLoaded = false;
let fetchPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<CompanySettingsState>) {
  state = { ...state, ...patch };
  emit();
}

export function useCompanySettings() {
  const currentState = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  const fetchSettings = useCallback(async (force = false) => {
    if (fetchPromise) return fetchPromise;
    if (hasLoaded && !force) return;

    setState({ loading: true });
    fetchPromise = (async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select(
          "company_name, address, phone, logo_url, stamp_url, signature_url, saldo_awal",
        )
        .maybeSingle();

      if (!error && data) {
        setState({
          profile: {
            companyName: data.company_name || "",
            address: data.address || "",
            phone: data.phone || "",
            logoUrl: data.logo_url,
            stampUrl: data.stamp_url,
            signatureUrl: data.signature_url,
            saldoAwal: Number(data.saldo_awal) || 0,
          },
        });
      }
      hasLoaded = true;
      setState({ loading: false });
    })();

    try {
      await fetchPromise;
    } finally {
      fetchPromise = null;
    }
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

    const dbPatch: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (patch.companyName !== undefined)
      dbPatch.company_name = patch.companyName;
    if (patch.address !== undefined) dbPatch.address = patch.address;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone;
    if (patch.saldoAwal !== undefined) dbPatch.saldo_awal = patch.saldoAwal;
    if (patch.logoUrl !== undefined) dbPatch.logo_url = patch.logoUrl;
    if (patch.stampUrl !== undefined) dbPatch.stamp_url = patch.stampUrl;
    if (patch.signatureUrl !== undefined)
      dbPatch.signature_url = patch.signatureUrl;

    const { error } = await supabase.from("company_settings").upsert(dbPatch);
    if (error) throw error;

    setState({ profile: { ...state.profile, ...patch } });
  }

  /** Kompatibilitas dengan pemakaian lama di kartu "Total Uang di Bank". */
  async function updateSaldoAwal(value: number) {
    await updateProfile({ saldoAwal: value });
  }

  /**
   * Upload file gambar (logo/stempel/ttd) ke Supabase Storage, lalu simpan URL publiknya
   * ke company_settings. field harus salah satu dari: 'logo' | 'stamp' | 'signature'.
   */
  async function uploadCompanyImage(
    field: "logo" | "stamp" | "signature",
    file: File,
  ) {
    const userId = await getUserId();
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/${field}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
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
    profile: currentState.profile,
    saldoAwal: currentState.profile.saldoAwal,
    loading: currentState.loading,
    refetch: () => fetchSettings(true),
    updateProfile,
    updateSaldoAwal,
    uploadCompanyImage,
    removeCompanyImage,
  };
}
