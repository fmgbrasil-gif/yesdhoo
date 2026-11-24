import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { mediaFormData } from '@/lib/form-data';
import { MEDIA_TYPES } from '@/lib/constants';
import { PageHeader } from '@/components/basic';
import { ActionForm, Tabs } from '@/components/ui';
import { MediaFields } from '@/components/MediaForm';
import { saveMedia } from '../midias/actions';
import { ContentPreview } from '@/components/ContentPreview';
import { mediaForPlayer } from '@/lib/playables';

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
      <div className="card p-5">
        <Tabs tabs={TYPES.map((t) => {
          const m = rows.find((r) => r.type === t); // um utilitario de cada tipo por conta
          return { label: MEDIA_TYPES[t], content: (
            <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,1.1fr)]">
              <ActionForm action={saveMedia} submit={m ? 'Salvar' : 'Ativar utilitário'}>
                <MediaFields type={t} media={m} data={data} onScreens={m ? [...new Set(m.items.map((i) => i.screenId))] : []} />
              </ActionForm>
              <div className="space-y-2">
                <p className="label">Como aparece na tela</p>
                {m ? <ContentPreview inline h={mediaForPlayer(m, 'H')} v={mediaForPlayer(m, 'V')} /> : <p className="rounded-lg bg-ink-50 p-4 text-sm text-ink-400 dark:bg-ink-900">Ative o utilitário para ver a prévia aqui. Depois de mudar as cores, salve para atualizar a prévia.</p>}
              </div>
            </div>
          ) };
        })} />
      </div>
    </>
  );
}
