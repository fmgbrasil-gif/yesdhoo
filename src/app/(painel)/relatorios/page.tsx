import Link from 'next/link';
import { headers } from 'next/headers';
import { Download, FileText, Search, X } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtInt, timeAgo } from '@/lib/util';
import { playReport, type ReportFilters } from '@/lib/report';
import { clientReportToken } from '@/lib/client-report';
import { kindLabel } from '@/lib/client-kind';
import { Bars, Empty, PageHeader } from '@/components/basic';
import { ClientReportSend } from '@/components/ClientReportSend';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthLabel = (m: string) => `${MESES[Number(m.slice(5)) - 1]}/${m.slice(0, 4)}`;
const hours = (s: number) => `${(s / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
const waPhone = (p: string | null) => { const d = (p ?? '').replace(/\D/g, ''); return d.length >= 10 ? (d.startsWith('55') && d.length >= 12 ? d : `55${d}`) : null; };

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = (await searchParams) as ReportFilters & Record<string, string | undefined>;
  const user = await requireUser();
  const [r, screens, clients, operations, categories, cities] = await Promise.all([
    playReport(user, sp),
    db.screen.findMany({ where: screenScope(user), orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.operation.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.category.findMany({ where: { screens: { some: screenScope(user) } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.screen.findMany({ where: { ...screenScope(user), city: { not: null } }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } }),
  ]);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : r.start.slice(0, 7);
  const keep = (extra: Record<string, string | undefined>) => {
    const base = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !['de', 'ate', 'periodo', 'mes'].includes(k)));
    return '?' + new URLSearchParams(Object.entries({ ...base, ...extra }).filter(([, v]) => v) as [string, string][]).toString();
  };
  const qs = new URLSearchParams(Object.entries({ ...sp, de: r.start, ate: r.end, periodo: undefined, mes: undefined }).filter(([, v]) => v) as [string, string][]).toString();
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const presets: [string, Record<string, string | undefined>, boolean][] = [
    ['Este mês', {}, !sp.periodo && !sp.mes && !sp.de],
    ['Mês passado', { periodo: 'mes-passado' }, sp.periodo === 'mes-passado'],
    ['Últimos 7 dias', { periodo: '7d' }, sp.periodo === '7d'],
    ['Últimos 30 dias', { periodo: '30d' }, sp.periodo === '30d'],
    ['Hoje', { periodo: 'hoje' }, sp.periodo === 'hoje'],
  ];
  const sel = (name: string, label: string, opts: { id: string; name: string }[], all = 'Todos') => (
    <label className="min-w-[160px] flex-1"><span className="label">{label}</span><select name={name} defaultValue={sp[name] ?? ''} className="input"><option value="">{all}</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
  );
  const anyFilter = ['tela', 'cliente', 'operacao', 'segmento', 'cidade', 'tipo', 'midia'].some((k) => sp[k]);

  return (
    <>
      <PageHeader title="Relatório de exibições" crumbs={[{ label: 'Relatórios' }, { label: 'Exibições' }]}>
        <a href={`/relatorio/exibicoes?${qs}`} target="_blank" className="btn-ghost"><FileText size={15} /> Relatório (PDF)</a>
        <a href={`/api/relatorios/exibicoes?${qs}`} className="btn-ghost"><Download size={15} /> Exportar CSV</a>
      </PageHeader>

      <div className="card mb-6 space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1 !mb-0">Período</span>
          {presets.map(([l, extra, on]) => <Link key={l} href={keep(extra)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${on ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-900 dark:text-ink-300'}`}>{l}</Link>)}
        </div>
        <form className="flex flex-wrap items-end gap-3">
          <label><span className="label">Mês</span><select name="mes" defaultValue={sp.mes ?? ''} className="input"><option value="">—</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
          <label><span className="label">De</span><input type="date" name="de" defaultValue={sp.mes || sp.periodo ? '' : r.start} className="input" /></label>
          <label><span className="label">Até</span><input type="date" name="ate" defaultValue={sp.mes || sp.periodo ? '' : r.end} className="input" /></label>
          {sel('cliente', 'Cliente', clients)}
          {sel('tela', 'Tela', screens, 'Todas')}
          {sel('operacao', 'Operação', operations, 'Todas')}
          {sel('segmento', 'Segmento', categories)}
          <label className="min-w-[140px] flex-1"><span className="label">Cidade</span><select name="cidade" defaultValue={sp.cidade ?? ''} className="input"><option value="">Todas</option>{cities.map((c) => <option key={c.city} value={c.city!}>{c.city}</option>)}</select></label>
          <label className="min-w-[140px] flex-1"><span className="label">Tipo de mídia</span><select name="tipo" defaultValue={sp.tipo ?? ''} className="input"><option value="">Todos</option><option value="video">Vídeo</option><option value="imagem">Imagem</option><option value="dinamico">Conteúdo dinâmico</option><option value="youtube">YouTube / site</option></select></label>
          <label className="min-w-[160px] flex-1"><span className="label">Mídia</span><input name="midia" defaultValue={sp.midia} placeholder="Nome da mídia..." className="input" /></label>
          <button className="btn-primary"><Search size={15} /> Aplicar filtros</button>
          {anyFilter && <Link href="/relatorios" className="btn-ghost"><X size={15} /> Limpar</Link>}
        </form>
        <p className="text-xs text-ink-400">Período: {new Date(r.start + 'T12:00').toLocaleDateString('pt-BR')} a {new Date(r.end + 'T12:00').toLocaleDateString('pt-BR')} ({r.days} dia{r.days === 1 ? '' : 's'}). Use o mês para os relatórios mensais dos clientes.</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[[fmtInt(r.total), 'exibições no período'], [fmtInt(Math.round(r.total / r.days)), 'média diária'], [hours(r.seconds), 'tempo total no ar'], [r.medias.length, 'mídias veiculadas'], [r.clients.length, 'clientes com veiculação']].map(([v, l]) => (
          <div key={String(l)} className="card p-4"><p className="text-2xl font-black">{v}</p><p className="text-xs text-ink-400">{l}</p></div>
        ))}
      </div>

      {r.byDay.length > 1 && (
        <section className="card mb-6 p-4">
          <h2 className="mb-3 font-bold">Exibições por dia</h2>
          <Bars data={r.byDay.map((d) => ({ label: d.date.slice(8), value: d.count, title: `${d.date.split('-').reverse().join('/')}: ${fmtInt(d.count)} exibições` }))} height={140} highlightMax />
        </section>
      )}

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4 dark:border-ink-700">
          <h2 className="font-bold">Por cliente — relatório mensal de {monthLabel(month)}</h2>
          <p className="text-xs text-ink-400">O botão WhatsApp manda o resumo e o link do relatório completo do mês para o cliente.</p>
        </div>
        {r.clients.length === 0 ? <Empty text="Nenhum cliente com exibição no período." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr><th className="th">Cliente</th><th className="th text-right">Exibições</th><th className="th text-right">Tempo no ar</th><th className="th text-right">Mídias</th><th className="th text-right">Telas</th><th className="th text-right">Relatório do cliente</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {r.clients.map((c) => {
                  const url = `${origin}/veiculacoes/${clientReportToken(c.id, month)}`;
                  const text = `*RELATÓRIO DE VEICULAÇÕES - ${monthLabel(month).toUpperCase()}*\n\nOlá, ${c.name}! Segue o resumo das suas veiculações em ${monthLabel(month)}${month === new Date().toISOString().slice(0, 7) ? ' (até hoje)' : ''}:\n\n- Exibições: ${fmtInt(c.count)}\n- Tempo no ar: ${hours(c.seconds)}\n- Telas: ${c.screens}\n- Anúncios: ${c.medias}\n\nRelatório completo:\n${url}\n\n${user.tenant.tradeName || user.tenant.name}`;
                  return (
                    <tr key={c.id}>
                      <td className="td"><Link href={keep({ cliente: c.id, ...(sp.mes ? { mes: sp.mes } : sp.periodo ? { periodo: sp.periodo } : { de: r.start, ate: r.end }) })} className="font-semibold hover:underline">{c.name}</Link><span className="block text-xs text-ink-400">{kindLabel(c.kind)}{c.phone ? '' : ' · sem celular'}</span></td>
                      <td className="td text-right font-semibold">{fmtInt(c.count)}</td>
                      <td className="td text-right">{hours(c.seconds)}</td>
                      <td className="td text-right">{c.medias}</td>
                      <td className="td text-right">{c.screens}</td>
                      <td className="td"><ClientReportSend url={url} phone={waPhone(c.phone)} text={text} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-ink-100 p-4 font-bold dark:border-ink-700">Por tela</h2>
          {r.screens.length === 0 ? <Empty text="Nenhuma exibição registrada no período." /> : (
            <table className="w-full">
              <thead><tr><th className="th">Tela</th><th className="th text-right">Exibições</th><th className="th text-right">Média diária</th><th className="th">Última sincronização</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {r.screens.map((s) => (
                  <tr key={s.id}>
                    <td className="td"><Link href={keep({ tela: s.id, ...(sp.mes ? { mes: sp.mes } : sp.periodo ? { periodo: sp.periodo } : { de: r.start, ate: r.end }) })} className="font-semibold hover:underline">{s.name}</Link>{s.city && <span className="block text-xs text-ink-400">{s.city}{s.state ? '/' + s.state : ''}</span>}</td>
                    <td className="td text-right">{fmtInt(s.count)}</td><td className="td text-right">{fmtInt(Math.round(s.count / r.days))}</td><td className="td text-ink-500">{timeAgo(s.syncedAt)}</td>
                    <td className="td text-right"><a href={`/relatorio/tela/${s.id}?mes=${month}`} target="_blank" className="text-xs font-semibold text-brand-600 hover:underline">Relatório</a></td>
                  </tr>
                ))}
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
                {r.medias.map((m) => <tr key={m.id}><td className="td"><span className="block font-semibold">{m.name}</span><span className="text-xs text-ink-400">{m.client}</span></td><td className="td text-right">{fmtInt(m.count)}</td><td className="td text-right">{hours(m.seconds)}</td><td className="td text-right">{m.screens}</td></tr>)}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
