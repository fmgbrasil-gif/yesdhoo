import { Pencil, Plus, Trash2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeAgo } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { mediaFormData } from '@/lib/form-data';
import { Avatar, Empty, PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal, MultiPicker, Tabs } from '@/components/ui';
import { deleteGroup, saveGroup } from '../midias/actions';

type Opt = { id: string; label: string; sub?: string };

function GroupFields({ group, medias, screens, onScreens = [] }: { group?: { id: string; name: string; medias: { mediaId: string }[] }; medias: Opt[]; screens: Opt[]; onScreens?: string[] }) {
  return (
    <>
      {group && <input type="hidden" name="id" value={group.id} />}
      <Tabs tabs={[
        { label: 'Info', content: (
          <>
            <Field label="Nome"><input name="name" required defaultValue={group?.name} className="input" placeholder="Ex.: Ofertas da semana" /></Field>
            <Field label="Imagem (opcional)"><input type="file" name="image" accept="image/*" className="input" /></Field>
            <Field label="Mídias" hint="O grupo ocupa uma posição na playlist e exibe uma mídia diferente a cada ciclo."><span /></Field>
            <MultiPicker name="medias" options={medias} defaultValue={group?.medias.map((m) => m.mediaId)} placeholder="Busque pelo nome da mídia..." emptyHint="Nenhuma mídia cadastrada." />
          </>
        ) },
        { label: 'Inclusão rápida', content: <MultiPicker name="screens" options={screens} defaultValue={onScreens} placeholder="Busque pelo nome da tela..." /> },
      ]} />
    </>
  );
}

export default async function GruposPage() {
  const user = await requireUser();
  const [groups, medias, data] = await Promise.all([
    db.mediaGroup.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, include: { medias: { select: { mediaId: true } }, items: { select: { screenId: true } } } }),
    db.media.findMany({ where: { tenantId: user.tenantId, type: { in: ['arquivo', 'youtube', 'link', 'aviso'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, duration: true } }),
    mediaFormData(user),
  ]);
  const opts = medias.map((m) => ({ id: m.id, label: m.name, sub: `${m.duration}s` }));
  return (
    <>
      <PageHeader title="Grupos de mídia" crumbs={[{ label: 'Conteúdos' }, { label: 'Minhas mídias', href: '/midias' }, { label: 'Grupos' }]}>
        <Modal trigger={<><Plus size={16} /> Novo grupo</>} title="Novo grupo"><ActionForm action={saveGroup}><GroupFields medias={opts} screens={data.screens} /></ActionForm></Modal>
      </PageHeader>
      <div className="card overflow-hidden">
        {groups.length === 0 ? <Empty text="Agrupe mídias para que elas se revezem na mesma posição da playlist." /> : (
          <table className="w-full">
            <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Grupo</th><th className="th">Mídias</th><th className="th">Telas</th><th className="th">Última alteração</th><th className="th text-right">Ações</th></tr></thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {groups.map((g) => {
                const onScreens = [...new Set(g.items.map((i) => i.screenId))];
                return (
                  <tr key={g.id}>
                    <td className="td"><span className="flex items-center gap-3"><Avatar src={fileUrl(g.image)} name={g.name} square /><span className="font-semibold">{g.name}</span></span></td>
                    <td className="td font-semibold">{g.medias.length}</td>
                    <td className="td font-semibold">{onScreens.length}</td>
                    <td className="td text-ink-500">{timeAgo(g.updatedAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title="Editar grupo"><ActionForm action={saveGroup}><GroupFields group={g} medias={opts} screens={data.screens} onScreens={onScreens} /></ActionForm></Modal>
                        <Confirm trigger={<Trash2 size={15} />} titleAttr="Remover" title="Excluir este grupo?" text={`O grupo “${g.name}” sai de todas as playlists. As mídias são mantidas.`} confirmLabel="Sim, quero excluir" action={deleteGroup} fields={{ id: g.id }} />
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
