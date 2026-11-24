import Link from 'next/link';
import { Eye, Layers, Pencil, Plus, Power, Search, Trash2, MonitorUp, FileVideo } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db, like } from '@/lib/db';
import { fmtDuration, timeAgo } from '@/lib/util';
import { mediaThumb } from '@/lib/playables';
import { mediaFormData } from '@/lib/form-data';
import { MEDIA_TYPES } from '@/lib/constants';
import { Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionButton, ActionForm, Confirm, Modal, Tabs } from '@/components/ui';
import { MediaFields, ScreensPicker } from '@/components/MediaForm';
import { deleteMedia, saveMedia, toggleMedia, saveMediaScreens } from './actions';
import { kindLabel } from '@/lib/client-kind';

const TYPES = ['arquivo', 'youtube', 'link'];

export default async function MidiasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { page, size, skip, take } = pageParams(sp);
  const origem = ['cliente', 'parceiro', 'cortesia', 'institucional'].includes(sp.origem ?? '') ? sp.origem : undefined;
  const base = { tenantId: user.tenantId, type: { in: TYPES } };
  const byOrigin = (o?: string) => (o === 'institucional' ? { clientId: null } : o ? { client: { kind: o } } : {});
  const where = {
    ...base, ...byOrigin(origem),
    ...(sp.q ? { name: like(sp.q) } : {}),
    ...(sp.cliente ? { client: { name: like(sp.cliente) } } : {}),
    ...(sp.status === 'ativo' ? { active: true } : sp.status === 'inativo' ? { active: false } : {}),
  };
  const counts = await Promise.all(['cliente', 'parceiro', 'cortesia', 'institucional'].map((o) => db.media.count({ where: { ...base, ...byOrigin(o) } })));
  const tabs: [string | undefined, string, number][] = [[undefined, 'Todas', counts[0] + counts[1] + counts[2] + counts[3]], ['cliente', 'Clientes', counts[0]], ['parceiro', 'Parceiros', counts[1]], ['cortesia', 'Cortesias', counts[2]], ['institucional', 'Institucional', counts[3]]];
  const [rows, total, data] = await Promise.all([
    db.media.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, include: { client: { select: { name: true, kind: true, active: true } }, items: { select: { screenId: true } } } }),
    db.media.count({ where }),
    mediaFormData(user),
  ]);

  return (
    <>
      <PageHeader title="Minhas mídias" crumbs={[{ label: 'Conteúdos' }, { label: 'Minhas mídias' }]}>
        <a href="/especificacoes" target="_blank" className="btn-ghost" title="Formato, resolução, duração e tamanho dos vídeos — para enviar a clientes e parceiros"><FileVideo size={16} /> Especificações de mídia</a>
        <Link href="/grupos" className="btn-ghost"><Layers size={16} /> Grupos</Link>
        <Modal trigger={<><Plus size={16} /> Nova mídia</>} title="Nova mídia">
          <Tabs tabs={TYPES.map((t) => ({ label: MEDIA_TYPES[t], content: <ActionForm action={saveMedia}><MediaFields type={t} data={data} /></ActionForm> }))} />
        </Modal>
      </PageHeader>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700" aria-label="Filtrar por origem">
          {tabs.map(([k, label, n]) => (
            <Link key={label} href={k ? `/midias?origem=${k}` : '/midias'} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${origem === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label} <span className="opacity-70">{n}</span></Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {origem && <input type="hidden" name="origem" value={origem} />}
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nome..." className="input w-48" aria-label="Nome" />
          <input name="cliente" defaultValue={sp.cliente} placeholder="Buscar por cliente ou parceiro..." className="input w-56" aria-label="Cliente ou parceiro" />
          <select name="status" defaultValue={sp.status ?? ''} className="input w-32" aria-label="Status"><option value="">Todos</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
        </form>
        {rows.length === 0 ? <Empty text="Envie sua primeira mídia em “Nova mídia”." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Mídia</th><th className="th">Telas</th><th className="th">Orientação</th><th className="th">Status</th><th className="th">Última alteração</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((m) => {
                  const thumb = mediaThumb(m);
                  const onScreens = [...new Set(m.items.map((i) => i.screenId))];
                  return (
                    <tr key={m.id} className="hover:bg-ink-50 dark:hover:bg-ink-700/40">
                      <td className="td">
                        <Link href={`/midias/${m.id}`} className="flex items-center gap-3">
                          <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-800 text-[10px] uppercase text-ink-300">
                            {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : MEDIA_TYPES[m.type]}{/* eslint-disable-line @next/next/no-img-element */}
                            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] text-white">{fmtDuration(m.duration)}</span>
                          </span>
                          <span><span className="block font-semibold">{m.name}</span><span className="text-xs text-ink-400">{m.type === 'arquivo' ? (m.kind === 'video' ? 'Vídeo' : 'Imagem') : MEDIA_TYPES[m.type]} · {m.client ? <>{kindLabel(m.client.kind)}: {m.client.name}</> : 'Institucional'}</span></span>
                        </Link>
                      </td>
                      <td className="td font-semibold">{onScreens.length}</td>
                      <td className="td text-ink-500">{m.type !== 'arquivo' ? 'Ambas' : [m.fileH && 'Horizontal', m.fileV && 'Vertical'].filter(Boolean).join(' + ')}</td>
                      <td className="td">
                        <span className={`badge ${m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>{m.active ? 'Ativa' : 'Inativa'}</span>
                        {m.client && !m.client.active && <span className="badge ml-1 bg-red-100 text-red-700" title="O cadastro está desativado: não roda nas telas">Fora do ar</span>}
                        {m.endDate && <span className="block text-xs text-ink-400">até {m.endDate.split('-').reverse().join('/')}</span>}
                      </td>
                      <td className="td text-ink-500">{timeAgo(m.updatedAt)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          <ActionButton action={toggleMedia} fields={{ id: m.id }} title={m.active ? 'Desativar' : 'Ativar'}><Power size={15} className={m.active ? 'text-emerald-600' : ''} /></ActionButton>
                          <Modal trigger={<><MonitorUp size={15} /> Telas</>} triggerClass="btn-ghost !px-2.5 !py-1.5" titleAttr="Telas onde passa" title={`Em quais telas “${m.name}” vai passar?`}>
                            <ActionForm action={saveMediaScreens} submit="Salvar telas">
                              <input type="hidden" name="id" value={m.id} />
                              <p className="text-sm text-ink-500">Marque as telas (ou use os atalhos das operações). Desmarcar tira da playlist.</p>
                              <ScreensPicker data={data} value={onScreens} />
                            </ActionForm>
                          </Modal>
                          <Link href={`/midias/${m.id}`} className="btn-icon" title="Detalhes" aria-label="Detalhes"><Eye size={15} /></Link>
                          <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title={`Editar mídia (${MEDIA_TYPES[m.type]})`}>
                            <ActionForm action={saveMedia}><MediaFields type={m.type} media={m} data={data} onScreens={onScreens} /></ActionForm>
                          </Modal>
                          <Confirm trigger={<Trash2 size={15} />} titleAttr="Remover" title="Excluir esta mídia?" text={`“${m.name}” será removida de todas as playlists. Esta operação é irreversível.`} confirmLabel="Sim, quero excluir" action={deleteMedia} fields={{ id: m.id }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} size={size} total={total} params={sp} base="/midias" />
      </div>
    </>
  );
}
