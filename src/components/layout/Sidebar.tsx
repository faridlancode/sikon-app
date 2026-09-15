import { NavLink } from 'react-router-dom';
import { Box, LayoutDashboard, ShoppingCart, Wallet2, Users, Building2, Tags } from 'lucide-react';
import { useCompanySettings } from '../../hooks/useCompanySettings';

const NAV_GROUPS = [
  {
    label: 'Ikhtisar',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Transaksi',
    items: [
      { to: '/orders', label: 'Pesanan', icon: ShoppingCart },
      { to: '/financial', label: 'Keuangan', icon: Wallet2 },
    ],
  },
  {
    label: 'Sumber Daya',
    items: [
      { to: '/sales', label: 'Pengguna & Sales', icon: Users },
      { to: '/kategori-produk', label: 'Kategori Produk', icon: Tags },
    ],
  },
  {
    label: 'Pengaturan',
    items: [{ to: '/perusahaan', label: 'Perusahaan', icon: Building2 }],
  },
];

export default function Sidebar() {
  const { profile } = useCompanySettings();
  const displayName = profile.companyName || 'SIKon ERP';

  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md text-primary-foreground ${profile.logoUrl ? 'bg-transparent shadow-none' : 'bg-primary shadow-sm'}`}>
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt={displayName} className="h-full w-full object-contain" />
          ) : (
            <Box className="h-4 w-4" strokeWidth={2.25} />
          )}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          <p className="text-[10px] text-muted-foreground">Sistem Integrasi Konveksi</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-2 text-[10px] font-semibold text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} SIKon ERP</p>
      </div>
    </aside>
  );
}
