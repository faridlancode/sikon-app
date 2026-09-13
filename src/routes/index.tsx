import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Arus Kas — Kelola Pemasukan & Pengeluaran" },
      {
        name: "description",
        content:
          "Catat pemasukan dan pengeluaran dalam Rupiah, lihat laba bersih, tren, dan rincian kategori.",
      },
      { property: "og:title", content: "Arus Kas — Kelola Pemasukan & Pengeluaran" },
      {
        property: "og:description",
        content: "Aplikasi manajemen arus kas pribadi dengan grafik tren dan rincian kategori.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard", search: { range: "30d" } });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
