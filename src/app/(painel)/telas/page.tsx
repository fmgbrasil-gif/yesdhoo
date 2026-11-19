import Link from 'next/link';
import { ListVideo, Plus, Search } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { isOnline, onlineCutoff, timeAgo } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { ORIENTATIONS } from '@/lib/constants';
import { Avatar, Empty, PageHeader, Pagination, StatusDot, pageParams } from '@/components/basic';
import { ActionForm, Modal } from '@/components/ui';
import { ScreenFields } from '@/components/ScreenForm';
import { createScreen } from './actions';

export default async function TelasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const scope = screenScope(user);
  const { page, size, skip, take } = pageParams(sp);
  const cutoff = onlineCutoff();
  const onlineWhere = { lastSeenAt: { gte: cutoff } };
  const offlineWhere = { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] };
  const status = sp.status === 'online' || sp.status === 'offline' ? sp.status : 'todas';
  const where = {
    ...scope,
    ...(sp.q ? { name: { contains: sp.q } } : {}),
    ...(sp.orientation === 'H' || sp.orientation === 'V' ? { orientation: sp.orientation } : {}),
    ...(status === 'online' ? onlineWhere : status === 'offline' ? offlineWhere : {}),
  };
  const [rows, total, nOnline, nAll, categories, clients] = await Promise.all([
    db.screen.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: { category: true, _count: { select: { items: true } } } }),
    db.screen.count({ where }),
    db.screen.count({ where: { ...scope, ...onlineWhere } }),
    db.screen.count({ where: scope }),
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const tab = (key: string, label: string, n: number) => (
    <Link href={`/telas${key === 'todas' ? '' : `?status=${key}`}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${status === key ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-ink-900' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>
      {label} <span className="ml-1 opacity-70">{n}</span>
    </Link>
  );

  return (
    <>
      <PageHeader title="Minhas telas" crumbs={[{ label: 'Minhas telas' }]}>
        <span className="text-sm text-ink-400">{nAll}/{user.tenant.planScreens} do plano</span>
        <Modal trigger={<><Plus size={16} /> Nova tela</>} title="Nova tela">
          <ActionForm action={createScreen} submit="Criar tela"><ScreenFields categories={categories} clients={clients} /></ActionForm>
        </Modal>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-3 dark:border-ink-700">
          <div className="flex gap-1">{tab('todas', 'Todas', nAll)}{tab('online', 'Online', nOnline)}{tab('offline', 'Offline', nAll - nOnline)}</div>
          <form className="flex flex-wrap gap-2">
            {status !== 'todas' && <input type="hidden" name="status" value={status} />}
            <input name="q" defaultValue={sp.q} placeholder="Buscar por nome..." className="input w-48" aria-label="Buscar por nome" />
            <select name="orientation" defaultValue={sp.orientation ?? ''} className="input w-36" aria-label="Orientação"><option value="">Orientação</option><option value="H">Horizontal</option><option value="V">Vertical</option></select>
            <button className="btn-ghost"><Search size={15} /> Filtrar</button>
          </form>
        </div>
        {rows.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Tela</th><th className="th">Disponibilidade</th><th className="th">Playlist</th><th className="th">Última comunicação</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((s) => {
                  const on = isOnline(s.lastSeenAt);
                  return (
                    <tr key={s.id} className="hover:bg-ink-50 dark:hover:bg-ink-700/40">
                      <td className="td">
                        <Link href={`/telas/${s.id}`} className="flex items-center gap-3">
                          <Avatar src={fileUrl(s.image)} name={s.name} square />
                          <span><span className="block font-semibold">{s.name}</span><span className="text-xs text-ink-400">{s.category?.name ?? 'Sem segmento'} · {ORIENTATIONS[s.orientation as 'H' | 'V']}</span></span>
                        </Link>
                      </td>
                      <td className="td">
                        {s.deviceToken
                          ? <span className={`badge ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-200'}`}><StatusDot online={on} /> {on ? 'Online' : 'Offline'}</span>
                          : <span className="badge bg-brand-100 text-brand-700">Aguardando pareamento · {s.pairingCode}</span>}
                      </td>
                      <td className="td">
                        <span className="font-semibold">{s._count.items}</span> <span className="text-ink-400">conteúdos</span>
                        {s.deviceToken && <span className="block text-xs text-ink-400">{s.syncedVersion >= s.playlistVersion ? 'Sincronizada' : 'Aguardando sincronização'}</span>}
                      </td>
                      <td className="td text-ink-500">{timeAgo(s.lastSeenAt)}</td>
                      <td className="td text-right"><Link href={`/telas/${s.id}/playlist`} className="btn-ghost"><ListVideo size={15} /> Playlist</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} size={size} total={total} params={sp} base="/telas" />
      </div>
    </>
  );
}
