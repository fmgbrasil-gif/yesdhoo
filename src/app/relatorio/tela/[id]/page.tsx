import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate } from '@/lib/money';
import { fmtDoc } from '@/lib/docs';
import { fmtDuration, localDate } from '@/lib/util';
import { cycleSeconds, screenPlaylist } from '@/lib/screen-playlist';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Relatório de mídias da tela', robots: { index: false, follow: false } };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Relatorio de midias de uma tela (A4): o que esta na playlist e quantas vezes passou no mes. */
export default async function RelatorioTela({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const screen = await db.screen.findFirst({ where: { ...screenScope(user), id } });
  if (!screen) notFound();
  const t = user.tenant;
  const today = localDate(screen.timezone);
  const mes = /^\d{4}-\d{2}$/.test((await searchParams).mes ?? '') ? (await searchParams).mes! : today.slice(0, 7);
  const [rows, stats] = await Promise.all([
    screenPlaylist(id),
    db.playStat.groupBy({ by: ['mediaId'], where: { screenId: id, date: { gte: `${mes}-01`, lte: `${mes}-31` } }, _sum: { count: true } }),
  ]);
  const plays = Object.fromEntries(stats.map((s) => [s.mediaId, s._sum.count ?? 0]));
  const total = stats.reduce((a, s) => a + (s._sum.count ?? 0), 0);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const label = (m: string) => `${MESES[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;
  const logo = fileUrl(t.logo);
  const addr = [screen.road, screen.number, screen.neighborhood, screen.city && `${screen.city}${screen.state ? '/' + screen.state : ''}`].filter(Boolean).join(', ');
  const now = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const th = 'border-b border-gray-400 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide';
  const td = 'px-2 py-1 align-top';
  const status = (r: (typeof rows)[number]) => !r.active ? 'Desativada' : r.endDate && r.endDate < today ? 'Vencida' : r.startDate && r.startDate > today ? 'Agendada' : 'No ar';

  return (
    <main className="min-h-screen bg-gray-200 py-6 text-black print:bg-white print:py-0" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{'@page { size: A4; margin: 12mm; } @media print { thead { display: table-header-group; } tr { break-inside: avoid; } }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-2 print:hidden">
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="mes">Exibições do mês</label>
          <select id="mes" name="mes" defaultValue={mes} className="rounded border border-gray-400 bg-white px-2 py-1">{months.map((m) => <option key={m} value={m}>{label(m)}</option>)}</select>
          <button className="rounded bg-gray-700 px-3 py-1 font-semibold text-white">Ver</button>
        </form>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-8 text-[11px] shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-center gap-4 border-b-2 border-black pb-3">
          {logo && <img src={logo} alt="" className="h-12 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
          <div className="flex-1">
            <h1 className="text-base font-bold uppercase tracking-wide">Relatório de mídias da tela</h1>
            <p>{t.tradeName || t.name}{t.document ? ` · CNPJ ${fmtDoc(t.document)}` : ''}</p>
            <p className="text-gray-600">Exibições de {label(mes)} · emitido em {now}</p>
          </div>
        </header>
        <section className="mb-4 rounded border border-gray-400 p-3">
          <p className="text-sm font-bold">{screen.name}</p>
          <p>{screen.orientation === 'V' ? 'Vertical' : 'Horizontal'}{addr ? ` · ${addr}` : ''}{screen.workStart && screen.workEnd ? ` · funcionamento ${screen.workStart} às ${screen.workEnd}` : ''}</p>
        </section>
        <section className="mb-5 grid grid-cols-4 gap-2 text-center">
          {[['Mídias na playlist', String(rows.length)], ['Ciclo da playlist', fmtDuration(cycleSeconds(rows))], ['Exibições no mês', total.toLocaleString('pt-BR')], ['Clientes', String(new Set(rows.map((r) => r.client).filter((c) => c && c !== 'Biblioteca')).size)]].map(([l, v]) => (
            <div key={l} className="rounded border border-gray-400 p-2"><p className="text-[9px] font-bold uppercase text-gray-600">{l}</p><p className="text-sm font-bold">{v}</p></div>
          ))}
        </section>
        {rows.length === 0 ? <p className="py-10 text-center text-gray-500">A playlist desta tela está vazia.</p> : (
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>#</th><th className={th}>Mídia</th><th className={th}>Cliente</th><th className={th}>Tipo</th><th className={`${th} text-right`}>Duração</th><th className={th}>Período</th><th className={th}>Situação</th><th className={`${th} text-right`}>Exibições</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className={td}>{r.slot}</td>
                  <td className={td}><b>{r.name}</b>{r.group && <span className="block text-gray-600">grupo {r.group}</span>}</td>
                  <td className={td}>{r.client ?? '—'}</td>
                  <td className={td}>{r.typeLabel}{r.type === 'arquivo' ? ` (${[r.fileH && 'H', r.fileV && 'V'].filter(Boolean).join('+')})` : ''}</td>
                  <td className={`${td} text-right`}>{r.duration}s</td>
                  <td className={td}>{r.startDate || r.endDate ? `${r.startDate ? fmtDate(r.startDate) : '…'} a ${r.endDate ? fmtDate(r.endDate) : '…'}` : 'Sempre'}</td>
                  <td className={td}>{status(r)}</td>
                  <td className={`${td} text-right font-bold`}>{(plays[r.id] ?? 0).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-[9px] text-gray-500">Exibições contadas pelo aparelho da tela (mídias com estatística ativada). Conteúdos da biblioteca sem estatística aparecem com zero.</p>
      </article>
    </main>
  );
}
