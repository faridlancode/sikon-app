import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, LogOut, ChevronDown, PanelLeft, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import Button from '../ui/button';

type HeaderProps = {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export default function Header({ sidebarCollapsed, onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const { profile } = useCompanySettings();
  const [menuOpen, setMenuOpen] = useState(false);

  const email = user?.email ?? '';
  const displayName = profile.companyName || 'SIKon ERP';
  const initial = displayName.charAt(0).toUpperCase();

  async function handleLogout() {
    await logout();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-7">
        <div className="flex items-center gap-2.5 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Box className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <p className="max-w-40 truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">Sistem Integrasi Konveksi</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          className="hidden h-9 w-9 px-0 lg:inline-flex"
          aria-label={sidebarCollapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
          title={sidebarCollapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
        >
          <PanelLeft className={`h-4 w-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </Button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-muted"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {initial}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-tight text-foreground">{displayName}</p>
              <span className="mt-0.5 inline-block rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold leading-none text-accent-foreground">
                Pemilik
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                <div className="border-b border-slate-100 px-3.5 py-3">
                  <p className="text-sm font-medium text-slate-900">{displayName}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{email}</p>
                </div>
                <Link
                  to="/perusahaan"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Pengaturan Perusahaan
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Keluar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
