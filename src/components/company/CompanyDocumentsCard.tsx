import Card from '../ui/card';
import ImageUploadField from './ImageUploadField';
import type { CompanyProfile } from '../../types';

type CompanyDocumentsCardProps = {
  profile: CompanyProfile;
  onUploadStamp: (file: File) => Promise<unknown>;
  onRemoveStamp: () => Promise<unknown>;
  onUploadSignature: (file: File) => Promise<unknown>;
  onRemoveSignature: () => Promise<unknown>;
};

export default function CompanyDocumentsCard({
  profile,
  onUploadStamp,
  onRemoveStamp,
  onUploadSignature,
  onRemoveSignature,
}: CompanyDocumentsCardProps) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Dokumen Resmi</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Stempel dan tanda tangan untuk surat menyurat & dokumen resmi perusahaan. Gunakan gambar dengan latar
        transparan (PNG) agar hasilnya rapi saat ditempel ke dokumen.
      </p>

      <div className="mt-5 space-y-5">
        <ImageUploadField
          label="Stempel Perusahaan"
          imageUrl={profile.stampUrl}
          onUpload={onUploadStamp}
          onRemove={onRemoveStamp}
        />
        <div className="border-t border-border" />
        <ImageUploadField
          label="Tanda Tangan"
          imageUrl={profile.signatureUrl}
          onUpload={onUploadSignature}
          onRemove={onRemoveSignature}
        />
      </div>
    </Card>
  );
}
