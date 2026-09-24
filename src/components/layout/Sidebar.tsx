import { NavLink } from 'react-router-dom';
import {
  Box,
  LayoutDashboard,
  ShoppingCart,
  Wallet2,
  Users,
  Building2,
  Layers,
  Package,
  Shirt,
  Warehouse,
  ReceiptText,
  UserCheck,
  Banknote,
  Scissors,
} from 'lucide-react';
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
      { to: '/payroll', label: 'Penggajian', icon: Banknote },
    ],
  },
  {
    label: 'Produksi & Logistik',
    items: [
      { to: '/worklog', label: 'Worklog Produksi', icon: Scissors },
      { to: '/kategori', label: 'Kategori', icon: Layers },
      { to: '/materials', label: 'Material', icon: Package },
      { to: '/products', label: 'Product', icon: Shirt },
      { to: '/gudang', label: 'Gudang', icon: Warehouse },
      { to: '/purchasing', label: 'Purchasing', icon: ReceiptText },
    ],
  },
  {
    label: 'Sumber Daya',
    items: [
      { to: '/sales', label: 'Pengguna & Sales', icon: Users },
      { to: '/staff', label: 'Staf & Karyawan', icon: UserCheck },
    ],
  },
  {
    label: 'Pengaturan',
    items: [{ to: '/perusahaan', label: 'Perusahaan', icon: Building2 }],
  },
];

type SidebarProps = {
  collapsed: boolean;
};

export default function Sidebar({ collapsed }: SidebarProps) {
  const { profile } = useCompanySettings();
  const displayName = profile.companyName || 'SIKon ERP';

  return (
    <aside
      className={`sticky top-0 hidden h-screen flex-shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px]' : 'w-60'}`}
    >
      <div className={`flex h-16 items-center border-b border-border ${collapsed ? 'justify-center px-3' : 'gap-3 px-4'}`}>
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md text-primary-foreground ${profile.logoUrl ? 'bg-transparent shadow-none' : 'bg-primary shadow-sm'}`}>
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt={displayName} className="h-full w-full object-contain" />
          ) : (
            <Box className="h-4 w-4" strokeWidth={2.25} />
          )}
        </div>
        <div className={`min-w-0 leading-tight ${collapsed ? 'hidden' : 'block'}`}>
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          <p className="text-[10px] text-muted-foreground">Sistem Integrasi Konveksi</p>
        </div>
      </div>

      <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'space-y-3 px-2' : 'space-y-5 px-3'}`}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 pb-2 text-[10px] font-semibold text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    `flex h-9 items-center rounded-md text-sm font-medium transition-colors ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'} ${isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-border py-3 ${collapsed ? 'px-2 text-center' : 'px-4'}`}>
        <p className="text-[10px] text-muted-foreground">
          {collapsed ? `© ${String(new Date().getFullYear()).slice(-2)}` : `© ${new Date().getFullYear()} SIKon ERP`}
        </p>
      </div>
    </aside>
  );
}
