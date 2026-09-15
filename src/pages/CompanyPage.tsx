import AppShell from '../components/layout/AppShell';
import CompanyProfileForm from '../components/company/CompanyProfileForm';
import CompanyDocumentsCard from '../components/company/CompanyDocumentsCard';
import BankAccountsCard from '../components/company/BankAccountsCard';
import AccountSecurityCard from '../components/company/AccountSecurityCard';
import { useCompanySettings } from '../hooks/useCompanySettings';

export default function CompanyPage() {
  const { profile, loading, updateProfile, uploadCompanyImage, removeCompanyImage } = useCompanySettings();

  if (loading) {
    return (
      <AppShell title="Informasi Perusahaan" subtitle="Kelola profil, dokumen, dan akun login perusahaan">
        <div className="flex justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Informasi Perusahaan" subtitle="Kelola profil, dokumen, dan akun login perusahaan">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CompanyProfileForm
          profile={profile}
          onSave={updateProfile}
          onUploadLogo={(file) => uploadCompanyImage('logo', file)}
          onRemoveLogo={() => removeCompanyImage('logo')}
        />
        <CompanyDocumentsCard
          profile={profile}
          onUploadStamp={(file) => uploadCompanyImage('stamp', file)}
          onRemoveStamp={() => removeCompanyImage('stamp')}
          onUploadSignature={(file) => uploadCompanyImage('signature', file)}
          onRemoveSignature={() => removeCompanyImage('signature')}
        />
      </div>

      <BankAccountsCard />

      <AccountSecurityCard />
    </AppShell>
  );
}
