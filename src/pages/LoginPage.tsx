import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Wallet, Eye, EyeOff, ArrowRight, ShieldCheck, TrendingUp, PieChart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { inputClass } from '../components/ui/FormField';

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
    <div className="flex min-h-screen bg-slate-50">
      {/* Panel kiri — identitas merek, disembunyikan di layar kecil */}
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-slate-900 px-12 py-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #4f46e5, transparent 70%)' }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <Wallet className="h-5 w-5 text-white" strokeWidth={2.25} />
          </div>
          <span className="text-lg font-semibold tracking-tight">SIKon Financial</span>
        </div>

        <div className="relative max-w-sm">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Satu dashboard untuk arus kas dan pembukuan perusahaan Anda.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Catat setiap pemasukan dan pengeluaran, pantau laba bersih secara real-time, dan lihat tren keuangan
            perusahaan dalam satu tampilan yang rapi.
          </p>

          <div className="mt-10 space-y-4">
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <TrendingUp className="h-4 w-4 flex-shrink-0 text-indigo-400" />
              Tren pemasukan vs pengeluaran bulanan
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <PieChart className="h-4 w-4 flex-shrink-0 text-indigo-400" />
              Alokasi pengeluaran per kategori
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-indigo-400" />
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <Wallet className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900">SIKon Financial</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Masuk ke akun Anda</h2>
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

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5
                text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {submitting ? 'Memproses...' : 'Masuk'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Akses aplikasi ini terbatas untuk pemilik perusahaan yang terdaftar.
          </p>
        </div>
      </div>
    </div>
  );
}
