import { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';
import { useAuth } from '../../context/AuthContext';

export default function AccountSecurityCard() {
  const { user, updateEmail, updatePassword } = useAuth();

  const [email, setEmail] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setEmailMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setEmailMessage({ type: 'error', text: 'Masukkan email yang valid.' });
      return;
    }

    setEmailSubmitting(true);
    try {
      await updateEmail(email.trim());
      setEmailMessage({ type: 'success', text: 'Email login berhasil diubah.' });
      setEmail('');
    } catch (err) {
      setEmailMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengubah email.' });
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordMessage(null);

    if (password.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password minimal 6 karakter.' });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }

    setPasswordSubmitting(true);
    try {
      await updatePassword(password);
      setPasswordMessage({ type: 'success', text: 'Password berhasil diubah.' });
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengubah password.' });
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Akun Login</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Email saat ini: <span className="font-medium text-foreground">{user?.email}</span>
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Ubah Email Login
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email-baru@perusahaan.com"
            className={inputClass}
          />
          {emailMessage && (
            <p className={`text-xs ${emailMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {emailMessage.text}
            </p>
          )}
          <Button type="submit" size="sm" disabled={emailSubmitting}>
            {emailSubmitting ? 'Menyimpan...' : 'Simpan Email'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Email langsung aktif tanpa perlu konfirmasi — gunakan email baru ini untuk login berikutnya.
          </p>
        </form>

        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Ubah Password
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password baru"
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Konfirmasi password baru"
            className={inputClass}
          />
          {passwordMessage && (
            <p className={`text-xs ${passwordMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {passwordMessage.text}
            </p>
          )}
          <Button type="submit" size="sm" disabled={passwordSubmitting}>
            {passwordSubmitting ? 'Menyimpan...' : 'Simpan Password'}
          </Button>
        </form>
      </div>
    </Card>
  );
}
