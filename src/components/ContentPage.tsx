import { Pencil, Plus, Trash2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeAgo } from '@/lib/util';
import { mediaFormData } from '@/lib/form-data';
import { Empty, PageHeader } from './basic';
import { ActionForm, Confirm, Modal } from './ui';
import { MediaFields } from './MediaForm';
import { deleteMedia, saveMedia } from '@/app/(painel)/midias/actions';

/** Pagina de listagem generica para conteudos simples (avisos e feeds RSS). */
export async function ContentPage({ type, title, newLabel, emptyText, children }: { type: string; title: string; newLabel: string; emptyText: string; children?: React.ReactNode }) {
  const user = await requireUser();
  const [rows, data] = await Promise.all([
    db.media.findMany({ where: { tenantId: user.tenantId, type }, orderBy: { updatedAt: 'desc' }, include: { items: { select: { screenId: true } } } }),
    mediaFormData(user),
  ]);
  return (
    <>
      <PageHeader title={title} crumbs={[{ label: 'Conteúdos' }, { label: title }]}>
        <Modal trigger={<><Plus size={16} /> {newLabel}</>} title={newLabel}><ActionForm action={saveMedia}><MediaFields type={type} data={data} /></ActionForm></Modal>
      </PageHeader>
      {children}
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty text={emptyText} /> : (
          <table className="w-full">
            <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Nome</th><th className="th">Duração</th><th className="th">Telas</th><th className="th">Última alteração</th><th className="th text-right">Ações</th></tr></thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {rows.map((m) => {
                const onScreens = [...new Set(m.items.map((i) => i.screenId))];
                return (
                  <tr key={m.id}>
                    <td className="td"><span className="block font-semibold">{m.name}</span>{m.url && <span className="block max-w-xs truncate text-xs text-ink-400">{m.url}</span>}</td>
                    <td className="td">{m.duration}s</td>
                    <td className="td font-semibold">{onScreens.length}</td>
                    <td className="td text-ink-500">{timeAgo(m.updatedAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title={`Editar ${m.name}`}><ActionForm action={saveMedia}><MediaFields type={type} media={m} data={data} onScreens={onScreens} /></ActionForm></Modal>
                        <Confirm trigger={<Trash2 size={15} />} titleAttr="Remover" title="Excluir este conteúdo?" text={`“${m.name}” será removido de todas as playlists.`} confirmLabel="Sim, quero excluir" action={deleteMedia} fields={{ id: m.id }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
