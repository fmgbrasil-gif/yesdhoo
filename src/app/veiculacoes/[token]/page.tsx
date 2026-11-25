import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientMonthReport, readClientReportToken } from '@/lib/client-report';
import { fileUrl } from '@/lib/storage';
import { fmtDoc } from '@/lib/docs';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Relatório de veiculações', robots: { index: false, follow: false } };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const n = (v: number) => Math.round(v).toLocaleString('pt-BR');
const hours = (s: number) => { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`; };

/** Relatorio publico (link assinado) das veiculacoes do cliente no mes, para enviar pelo WhatsApp. */
export default async function Veiculacoes({ params }: { params: Promise<{ token: string }> }) {
  const t = readClientReportToken((await params).token);
  if (!t) notFound();
  const r = await clientMonthReport(t.clientId, t.month);
  if (!r) notFound();
  const label = `${MESES[Number(t.month.slice(5)) - 1]} de ${t.month.slice(0, 4)}`;
  const logo = fileUrl(r.tenant.logo);
  const max = Math.max(1, ...r.days.map((d) => d.count));
  const th = 'border-b border-gray-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-gray-600';
  const td = 'px-2 py-1.5 align-top';
  return (
    <main className="min-h-screen bg-[#f6f3fb] py-6 text-[#1d1029] print:bg-white print:py-0" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
      <style>{'@page { size: A4; margin: 12mm; } @media print { tr, section { break-inside: avoid; } }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-3 print:hidden"><PrintButton /></div>
      <article className="mx-auto max-w-[210mm] space-y-5 bg-white p-6 text-[12px] shadow-sm sm:p-8 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-center gap-4 border-b-2 border-[#7f4be4] pb-4">
          {logo && <img src={logo} alt="" className="h-14 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
          <div className="flex-1">
            <h1 className="text-lg font-black uppercase tracking-wide">Relatório de veiculações</h1>
            <p className="text-gray-600">{r.tenant.tradeName || r.tenant.name}{r.tenant.document ? ` · CNPJ ${fmtDoc(r.tenant.document)}` : ''}</p>
          </div>
          <div className="text-right"><p className="text-[10px] font-bold uppercase text-gray-500">Período</p><p className="text-base font-black text-[#7f4be4]">{label.charAt(0).toUpperCase() + label.slice(1)}</p></div>
        </header>
        <section>
          <p className="text-[10px] font-bold uppercase text-gray-500">Cliente</p>
          <p className="text-base font-bold">{r.client.tradeName || r.client.name}</p>
          {r.client.document && <p className="text-gray-600">{r.client.type === 'PF' ? 'CPF' : 'CNPJ'} {fmtDoc(r.client.document)}</p>}
        </section>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Exibições no mês', n(r.total)], ['Tempo total no ar', hours(r.seconds)], ['Telas', String(r.screens.length)], [r.impact ? 'Pessoas impactadas (estim.)' : 'Dias com veiculação', r.impact ? n(r.impact) : String(r.activeDays)]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[#f3edff] p-3 text-center"><p className="text-[10px] font-bold uppercase text-gray-600">{k}</p><p className="text-xl font-black text-[#2a1240]">{v}</p></div>
          ))}
        </section>
        <section>
          <h2 className="mb-2 font-bold">Exibições por dia</h2>
          <div className="flex h-28 items-end gap-[2px] rounded-lg border border-gray-200 p-2">
            {r.days.map((d) => <div key={d.date} title={`${d.date.slice(8)}/${d.date.slice(5, 7)}: ${d.count}`} className="flex-1 rounded-t bg-[#7f4be4]" style={{ height: `${Math.max(d.count ? 4 : 0, (d.count / max) * 100)}%` }} />)}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>01</span><span>{r.days.length >= 15 ? '15' : ''}</span><span>{String(r.days.length)}</span></div>
        </section>
        <section>
          <h2 className="mb-2 font-bold">Por anúncio</h2>
          {r.medias.length === 0 ? <p className="text-gray-500">Nenhuma exibição registrada neste mês.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>Anúncio</th><th className={`${th} text-right`}>Exibições</th><th className={`${th} text-right`}>Tempo no ar</th><th className={`${th} text-right`}>Telas</th></tr></thead>
              <tbody>{r.medias.map((m) => <tr key={m.name} className="border-b border-gray-100"><td className={`${td} font-semibold`}>{m.name}</td><td className={`${td} text-right`}>{n(m.count)}</td><td className={`${td} text-right`}>{hours(m.seconds)}</td><td className={`${td} text-right`}>{m.screens}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section>
          <h2 className="mb-2 font-bold">Por ponto de exibição</h2>
          {r.screens.length === 0 ? <p className="text-gray-500">—</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>Tela</th><th className={th}>Local</th><th className={`${th} text-right`}>Exibições</th></tr></thead>
              <tbody>{r.screens.map((s) => <tr key={s.name} className="border-b border-gray-100"><td className={`${td} font-semibold`}>{s.name}</td><td className={td}>{s.place || '—'}</td><td className={`${td} text-right`}>{n(s.count)}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <p className="text-[10px] text-gray-500">Exibições registradas automaticamente pelos aparelhos das telas. {r.impact ? 'Pessoas impactadas: estimativa pelo fluxo médio diário informado para cada ponto. ' : ''}Documento gerado em {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}.</p>
      </article>
    </main>
  );
}
