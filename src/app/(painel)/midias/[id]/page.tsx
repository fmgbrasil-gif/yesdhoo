import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtBytes, lastDays, timeAgo, youtubeId } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { mediaFormData } from '@/lib/form-data';
import { MEDIA_TYPES } from '@/lib/constants';
import { Bars, PageHeader } from '@/components/basic';
import { ActionForm, Modal } from '@/components/ui';
import { MediaFields, ScreensPicker } from '@/components/MediaForm';
import { Notes } from '@/components/Notes';
import { saveMedia, saveMediaNotes, saveMediaScreens } from '../actions';

export default async function MidiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const m = await db.media.findFirst({ where: { id, tenantId: user.tenantId }, include: { client: true, category: true } });
  if (!m) notFound();
  const days = lastDays(30);
  const [data, screens, stats] = await Promise.all([
    mediaFormData(user),
    db.screen.findMany({ where: { ...screenScope(user), items: { some: { OR: [{ mediaId: id }, { group: { medias: { some: { mediaId: id } } } }] } } }, orderBy: { name: 'asc' } }),
    db.playStat.groupBy({ by: ['date'], where: { mediaId: id, date: { gte: days[0] } }, _sum: { count: true } }),
  ]);
  // telas em que a midia esta direto na playlist (as de grupos aparecem na lista abaixo)
  const direct = (await db.playlistItem.findMany({ where: { mediaId: id, screen: screenScope(user) }, select: { screenId: true } })).map((i) => i.screenId);
  const byDate = Object.fromEntries(stats.map((s) => [s.date, s._sum.count ?? 0]));
  const src = fileUrl(m.fileH || m.fileV);
  const yt = m.type === 'youtube' && m.url ? youtubeId(m.url) : null;
  const rows: [string, string][] = [
    ['Tipo', MEDIA_TYPES[m.type]], ['Duração', `${m.duration}s`], ['Grava estatística', m.storeStats ? 'Sim' : 'Não'],
    ['Dimensões', m.width ? `${m.width} × ${m.height}px` : '—'], ['Arquivos', [m.fileH && 'Horizontal', m.fileV && 'Vertical'].filter(Boolean).join(' + ') || '—'],
    ['Tamanho', fmtBytes(m.size)], ['Período', m.startDate || m.endDate ? `${m.startDate ?? '…'} a ${m.endDate ?? '…'}` : 'Sempre'],
    ['Turno', m.shiftStart || m.shiftEnd ? `${m.shiftStart ?? '00:00'} às ${m.shiftEnd ?? '23:59'}` : 'Dia todo'],
    ['Cadastrada', timeAgo(m.createdAt)], ['Última alteração', timeAgo(m.updatedAt)],
  ];

  return (
    <>
      <PageHeader title={m.name} crumbs={[{ label: 'Minhas mídias', href: '/midias' }, { label: m.name }]}>
        <span className={`badge ${m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>{m.active ? 'Ativa' : 'Inativa'}</span>
        <Modal trigger={<><Pencil size={15} /> Editar</>} triggerClass="btn-ghost" title={`Editar mídia (${MEDIA_TYPES[m.type]})`}>
          <ActionForm action={saveMedia}><MediaFields type={m.type} media={m} data={data} onScreens={screens.map((s) => s.id)} /></ActionForm>
        </Modal>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card overflow-hidden bg-ink-900">
            {m.kind === 'video' && src ? <video src={src} controls className="max-h-96 w-full" />
              : m.kind === 'image' && src ? <img src={src} alt={m.name} className="max-h-96 w-full object-contain" /> // eslint-disable-line @next/next/no-img-element
              : yt ? <iframe src={`https://www.youtube.com/embed/${yt}`} className="aspect-video w-full" title={m.name} allowFullScreen />
              : <p className="p-8 text-center text-sm text-ink-300">{m.url}</p>}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Detalhes</h2>
            <p className="mb-3 text-sm text-ink-500">{m.client?.name ?? 'Avulso'}{m.category ? ` · ${m.category.name}` : ''}</p>
            <dl className="grid grid-cols-2 gap-4 text-sm">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-ink-400">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-bold">Exibições (últimos 30 dias)</h2>
            <Bars data={days.map((d) => ({ label: d.slice(8), value: byDate[d] ?? 0, title: `${d}: ${byDate[d] ?? 0}` }))} height={140} highlightMax />
          </section>
          <section className="card p-5">
            <h2 className="mb-1 font-bold">Telas onde passa</h2>
            <p className="mb-3 text-xs text-ink-500">Marque as telas onde esta mídia deve passar e clique em Salvar. Desmarcar tira da playlist.</p>
            <ActionForm action={saveMediaScreens} submit="Salvar telas" className="mb-4 space-y-3">
              <input type="hidden" name="id" value={m.id} />
              <ScreensPicker data={data} value={direct} />
            </ActionForm>
            <h3 className="mb-1 text-sm font-semibold">Reproduzindo agora em</h3>
            {screens.length === 0 && <p className="text-sm text-ink-400">Esta mídia ainda não está em nenhuma playlist.</p>}
            <ul className="divide-y divide-ink-100 dark:divide-ink-700">
              {screens.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/telas/${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                  <span className="text-xs text-ink-400">{!s.deviceToken ? 'Sem dispositivo' : s.syncedVersion >= s.playlistVersion ? 'Baixada' : 'Aguardando sincronização...'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-400">Total de telas: {screens.length}</p>
          </section>
          <Notes action={saveMediaNotes} defaultValue={m.notes} id={m.id} />
        </div>
      </div>
    </>
  );
}
