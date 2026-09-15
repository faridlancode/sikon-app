import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, Eye, EyeOff, ArrowRight, ShieldCheck, TrendingUp, PieChart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { inputClass } from '../components/ui/FormField';
import Button from '../components/ui/button';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError('Email atau kata sandi salah. Periksa kembali kredensial Anda.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Panel kiri — identitas merek, disembunyikan di layar kecil */}
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-foreground px-12 py-12 text-primary-foreground lg:flex">

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Box className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <span className="text-lg font-semibold">SIKon ERP</span>
        </div>

        <div className="relative max-w-sm">
          <h1 className="text-3xl font-semibold leading-tight">
            Satu dashboard untuk arus kas dan pembukuan perusahaan Anda.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Catat setiap pemasukan dan pengeluaran, pantau laba bersih secara real-time, dan lihat tren keuangan
            perusahaan dalam satu tampilan yang rapi.
          </p>

          <div className="mt-10 space-y-4">
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <TrendingUp className="h-4 w-4 flex-shrink-0 text-sky-400" />
              Tren pemasukan vs pengeluaran bulanan
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <PieChart className="h-4 w-4 flex-shrink-0 text-sky-400" />
              Alokasi pengeluaran per kategori
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-sky-400" />
              Akses khusus pemilik, data tersimpan aman
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} SIKon Financial</p>
      </div>

      {/* Panel kanan — form login */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Box className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <span className="text-lg font-semibold text-foreground">SIKon ERP</span>
          </div>

          <h2 className="text-2xl font-semibold text-foreground">Masuk ke akun Anda</h2>
          <p className="mt-1.5 text-sm text-slate-500">Gunakan kredensial owner yang telah didaftarkan.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@sikon.com"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Kata Sandi</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? 'Memproses...' : 'Masuk'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Akses aplikasi ini terbatas untuk pemilik perusahaan yang terdaftar.
          </p>
        </div>
      </div>
    </div>
  );
}
