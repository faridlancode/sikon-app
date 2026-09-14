import { NavLink } from 'react-router-dom';
import { Wallet, LayoutDashboard, ShoppingCart, Wallet2, Users } from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Transaksi',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingCart },
      { to: '/financial', label: 'Financial', icon: Wallet2 },
    ],
  },
  {
    label: 'Master Data',
    items: [{ to: '/sales', label: 'Sales', icon: Users }],
  },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white/80 backdrop-blur lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <Wallet className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="leading-tight">
          <p className="text-base font-semibold tracking-tight text-slate-900">SIKon</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Financial</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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

      <div className="border-t border-slate-200 px-5 py-4">
        <p className="text-[11px] text-slate-400">© {new Date().getFullYear()} SIKon Financial</p>
      </div>
    </aside>
  );
}
