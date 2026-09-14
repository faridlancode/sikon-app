import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Wallet2, Users } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';

const MOBILE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Order', icon: ShoppingCart },
  { to: '/financial', label: 'Financial', icon: Wallet2 },
  { to: '/sales', label: 'Sales', icon: Users },
];

type AppShellProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <Header />

          <nav className="border-b border-slate-200 bg-white/80 px-2 backdrop-blur lg:hidden">
            {MOBILE_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium ${isActive ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
              {(title || actions) && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {title && <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>}
                    {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
                  </div>
                  {actions && <div className="flex-shrink-0">{actions}</div>}
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
