import { Download, Search } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtInt, timeAgo } from '@/lib/util';
import { playReport } from '@/lib/report';
import { Empty, PageHeader } from '@/components/basic';

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [r, screens, clients] = await Promise.all([
    playReport(user, sp),
    db.screen.findMany({ where: screenScope(user), orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const qs = new URLSearchParams(Object.entries({ ...sp, de: r.start, ate: r.end }).filter(([, v]) => v) as [string, string][]).toString();
  const hours = (s: number) => `${(s / 3600).toFixed(1)}h`;

  return (
    <>
      <PageHeader title="Relatório de exibições" crumbs={[{ label: 'Relatórios' }, { label: 'Exibições' }]}>
        <a href={`/api/relatorios/exibicoes?${qs}`} className="btn-ghost"><Download size={15} /> Exportar CSV</a>
      </PageHeader>
      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label><span className="label">De</span><input type="date" name="de" defaultValue={r.start} className="input" /></label>
        <label><span className="label">Até</span><input type="date" name="ate" defaultValue={r.end} className="input" /></label>
        <label><span className="label">Tela</span><select name="tela" defaultValue={sp.tela ?? ''} className="input"><option value="">Todas</option>{screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label><span className="label">Cliente</span><select name="cliente" defaultValue={sp.cliente ?? ''} className="input"><option value="">Todos</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className="label">Mídia</span><input name="midia" defaultValue={sp.midia} placeholder="Nome da mídia..." className="input" /></label>
        <button className="btn-primary"><Search size={15} /> Aplicar filtros</button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[[fmtInt(r.total), 'exibições no período'], [fmtInt(Math.round(r.total / r.days)), 'média diária'], [r.medias.length, 'mídias veiculadas']].map(([v, l]) => (
          <div key={String(l)} className="card p-4"><p className="text-2xl font-black">{v}</p><p className="text-xs text-ink-400">{l}</p></div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-ink-100 p-4 font-bold dark:border-ink-700">Por tela</h2>
          {r.screens.length === 0 ? <Empty text="Nenhuma exibição registrada no período." /> : (
            <table className="w-full">
              <thead><tr><th className="th">Tela</th><th className="th text-right">Exibições</th><th className="th text-right">Média diária</th><th className="th">Última sincronização</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {r.screens.map((s) => <tr key={s.id}><td className="td font-semibold">{s.name}</td><td className="td text-right">{fmtInt(s.count)}</td><td className="td text-right">{fmtInt(Math.round(s.count / r.days))}</td><td className="td text-ink-500">{timeAgo(s.syncedAt)}</td></tr>)}
              </tbody>
            </table>
          )}
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-ink-100 p-4 font-bold dark:border-ink-700">Por mídia</h2>
          {r.medias.length === 0 ? <Empty text="Nenhuma exibição registrada no período." /> : (
            <table className="w-full">
              <thead><tr><th className="th">Mídia</th><th className="th text-right">Exibições</th><th className="th text-right">Tempo no ar</th><th className="th text-right">Telas</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {r.medias.map((m) => <tr key={m.name + m.client}><td className="td"><span className="block font-semibold">{m.name}</span><span className="text-xs text-ink-400">{m.client}</span></td><td className="td text-right">{fmtInt(m.count)}</td><td className="td text-right">{hours(m.seconds)}</td><td className="td text-right">{m.screens}</td></tr>)}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
