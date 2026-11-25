import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDoc } from '@/lib/docs';
import { playReport, type ReportFilters } from '@/lib/report';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Relatório de exibições', robots: { index: false, follow: false } };

const n = (v: number) => Math.round(v).toLocaleString('pt-BR');
const hours = (s: number) => `${(s / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
const br = (d: string) => d.split('-').reverse().join('/');

/** Relatorio geral de exibicoes (A4), com os mesmos filtros da tela de Relatorios. */
export default async function RelatorioExibicoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = (await searchParams) as ReportFilters;
  const user = await requireUser();
  const r = await playReport(user, sp);
  const t = user.tenant;
  const names = async () => {
    const [cl, sc, op, cat] = await Promise.all([
      sp.cliente ? db.client.findFirst({ where: { id: sp.cliente, tenantId: user.tenantId }, select: { name: true } }) : null,
      sp.tela ? db.screen.findFirst({ where: { id: sp.tela, tenantId: user.tenantId }, select: { name: true } }) : null,
      sp.operacao ? db.operation.findFirst({ where: { id: sp.operacao, tenantId: user.tenantId }, select: { name: true } }) : null,
      sp.segmento ? db.category.findFirst({ where: { id: sp.segmento }, select: { name: true } }) : null,
    ]);
    return [cl && `cliente ${cl.name}`, sc && `tela ${sc.name}`, op && `operação ${op.name}`, cat && `segmento ${cat.name}`, sp.cidade && `cidade ${sp.cidade}`,
      sp.tipo && `tipo ${({ video: 'vídeo', imagem: 'imagem', dinamico: 'conteúdo dinâmico', youtube: 'YouTube/site' } as Record<string, string>)[sp.tipo] ?? sp.tipo}`, sp.midia && `mídia contém "${sp.midia}"`].filter(Boolean).join(' · ');
  };
  const filtros = await names();
  const logo = fileUrl(t.logo);
  const th = 'border-b border-gray-400 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide';
  const td = 'px-2 py-1 align-top';
  return (
    <main className="min-h-screen bg-gray-200 py-6 text-black print:bg-white print:py-0" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{'@page { size: A4; margin: 12mm; } @media print { thead { display: table-header-group; } tr, section { break-inside: avoid; } }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-2 print:hidden"><PrintButton /></div>
      <article className="mx-auto max-w-[210mm] space-y-5 bg-white p-8 text-[11px] shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-center gap-4 border-b-2 border-black pb-3">
          {logo && <img src={logo} alt="" className="h-12 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
          <div className="flex-1">
            <h1 className="text-base font-bold uppercase tracking-wide">Relatório de exibições</h1>
            <p>{t.tradeName || t.name}{t.document ? ` · CNPJ ${fmtDoc(t.document)}` : ''}</p>
            <p className="text-gray-600">{br(r.start)} a {br(r.end)}{filtros ? ` · ${filtros}` : ''}</p>
          </div>
        </header>
        <section className="grid grid-cols-5 gap-2 text-center">
          {[['Exibições', n(r.total)], ['Média diária', n(r.total / r.days)], ['Tempo no ar', hours(r.seconds)], ['Mídias', String(r.medias.length)], ['Clientes', String(r.clients.length)]].map(([l, v]) => (
            <div key={l} className="rounded border border-gray-400 p-2"><p className="text-[9px] font-bold uppercase text-gray-600">{l}</p><p className="text-sm font-bold">{v}</p></div>
          ))}
        </section>
        {[
          ['Por cliente', ['Cliente', 'Exibições', 'Tempo no ar', 'Mídias', 'Telas'], r.clients.map((c) => [c.name, n(c.count), hours(c.seconds), String(c.medias), String(c.screens)])],
          ['Por tela', ['Tela', 'Exibições', 'Média diária', 'Cidade'], r.screens.map((s) => [s.name, n(s.count), n(s.count / r.days), s.city ? `${s.city}${s.state ? '/' + s.state : ''}` : '—'])],
          ['Por mídia', ['Mídia', 'Cliente', 'Exibições', 'Tempo no ar', 'Telas'], r.medias.map((m) => [m.name, m.client, n(m.count), hours(m.seconds), String(m.screens)])],
        ].map(([title, cols, rows]) => (
          <section key={title as string}>
            <h2 className="mb-1 text-sm font-bold">{title as string}</h2>
            {(rows as string[][]).length === 0 ? <p className="text-gray-500">Nenhuma exibição no período.</p> : (
              <table className="w-full border-collapse">
                <thead><tr>{(cols as string[]).map((c, i) => <th key={c} className={`${th} ${i > 0 && c !== 'Cliente' && c !== 'Cidade' ? 'text-right' : ''}`}>{c}</th>)}</tr></thead>
                <tbody>{(rows as string[][]).map((row, i) => <tr key={i} className="border-b border-gray-200">{row.map((v, j) => <td key={j} className={`${td} ${j === 0 ? 'font-bold' : ''} ${j > 0 && (cols as string[])[j] !== 'Cliente' && (cols as string[])[j] !== 'Cidade' ? 'text-right' : ''}`}>{v}</td>)}</tr>)}</tbody>
              </table>
            )}
          </section>
        ))}
        <p className="text-[9px] text-gray-500">Exibições registradas automaticamente pelos aparelhos das telas. Emitido em {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}.</p>
      </article>
    </main>
  );
}
