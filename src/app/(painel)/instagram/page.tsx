import { Camera } from 'lucide-react';
import { PageHeader } from '@/components/basic';

export default function InstagramPage() {
  return (
    <>
      <PageHeader title="Instagram" crumbs={[{ label: 'Conteúdos' }, { label: 'Instagram' }]} />
      <div className="card flex flex-col items-center gap-2 p-12 text-center">
        <Camera size={36} className="text-ink-300" />
        <p className="text-lg font-bold">Recurso disponível em breve</p>
        <p className="max-w-md text-sm text-ink-400">A exibição do feed de um perfil do Instagram depende de um aplicativo aprovado na Meta (Instagram Graph API). A estrutura de conteúdos já está pronta para receber essa integração.</p>
      </div>
    </>
  );
}
