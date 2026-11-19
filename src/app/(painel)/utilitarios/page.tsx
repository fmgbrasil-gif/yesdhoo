import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaFormData } from '@/lib/form-data';
import { MEDIA_TYPES } from '@/lib/constants';
import { PageHeader } from '@/components/basic';
import { ActionForm, Tabs } from '@/components/ui';
import { MediaFields } from '@/components/MediaForm';
import { saveMedia } from '../midias/actions';

const TYPES = ['hora', 'dolar', 'clima'];

export default async function UtilitariosPage() {
  const user = await requireUser();
  const [rows, data] = await Promise.all([
    db.media.findMany({ where: { tenantId: user.tenantId, type: { in: TYPES } }, include: { items: { select: { screenId: true } } } }),
    mediaFormData(user),
  ]);
  return (
    <>
      <PageHeader title="Utilitários" crumbs={[{ label: 'Conteúdos' }, { label: 'Utilitários' }]} />
      <div className="card max-w-2xl p-5">
        <Tabs tabs={TYPES.map((t) => {
          const m = rows.find((r) => r.type === t); // um utilitario de cada tipo por conta
          return { label: MEDIA_TYPES[t], content: (
            <ActionForm action={saveMedia} submit={m ? 'Salvar' : 'Ativar utilitário'}>
              <MediaFields type={t} media={m} data={data} onScreens={m ? [...new Set(m.items.map((i) => i.screenId))] : []} />
            </ActionForm>
          ) };
        })} />
      </div>
    </>
  );
}
