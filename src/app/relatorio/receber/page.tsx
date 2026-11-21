import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate, fmtMoney } from '@/lib/money';
import { fmtDoc } from '@/lib/docs';
import { openDebts } from '@/lib/receivables';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Relatório de débitos em aberto', robots: { index: false, follow: false } };

/** Relatorio de debitos em aberto por cliente (A4), para imprimir ou salvar em PDF. */
export default async function RelatorioReceber({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const t = user.tenant;
  const f = { cliente: sp.cliente, operacao: sp.operacao, situacao: sp.situacao, ate: sp.ate };
  const { today, list, totals } = await openDebts(user.tenantId, f);
  const op = f.operacao ? await db.operation.findFirst({ where: { id: f.operacao, tenantId: user.tenantId }, select: { name: true } }) : null;
  const logo = fileUrl(t.logo);
  const filtros = [
    f.situacao === 'vencidas' ? 'somente vencidos' : f.situacao === 'avencer' ? 'somente a vencer' : 'todos em aberto',
    op && `operação ${op.name}`, f.ate && `vencimento até ${fmtDate(f.ate)}`, f.cliente && `cliente contém "${f.cliente}"`,
  ].filter(Boolean).join(' · ');
  const now = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const th = 'border-b border-gray-400 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide';
  const td = 'px-2 py-1 align-top';

  return (
    <main className="min-h-screen bg-gray-200 py-6 text-black print:bg-white print:py-0" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{'@page { size: A4; margin: 12mm; } @media print { thead { display: table-header-group; } tr, .cliente { break-inside: avoid; } }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-2 print:hidden">
        <p className="text-sm text-gray-600">Use <b>Imprimir / PDF</b> e escolha “Salvar como PDF” para gerar o arquivo.</p>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-8 text-[11px] shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-center gap-4 border-b-2 border-black pb-3">
          {logo && <img src={logo} alt="" className="h-12 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
          <div className="flex-1">
            <h1 className="text-base font-bold uppercase tracking-wide">Relatório de débitos em aberto</h1>
            <p>{t.tradeName || t.name}{t.document ? ` · CNPJ ${fmtDoc(t.document)}` : ''}</p>
            <p className="text-gray-600">Posição em {fmtDate(today)} · {filtros} · emitido em {now}</p>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-4 gap-2 text-center">
          {[['Total em aberto', totals.total, ''], ['Vencido', totals.overdue, 'text-red-700'], ['A vencer', totals.open, ''], ['Clientes / faturas', null, '']].map(([l, v, c]) => (
            <div key={String(l)} className="rounded border border-gray-400 p-2">
              <p className="text-[9px] font-bold uppercase text-gray-600">{String(l)}</p>
              <p className={`text-sm font-bold ${c}`}>{v === null ? `${totals.clients} / ${totals.invoices}` : fmtMoney(v as number)}</p>
            </div>
          ))}
        </section>

        {list.length === 0 ? <p className="py-10 text-center text-gray-500">Nenhum débito em aberto com estes filtros.</p> : list.map((g) => (
          <section key={g.client.id} className="cliente mb-4">
            <div className="flex items-baseline justify-between border-b border-black bg-gray-100 px-2 py-1">
              <p className="font-bold uppercase">{g.client.name}{g.client.tradeName && g.client.tradeName !== g.client.name ? ` (${g.client.tradeName})` : ''}</p>
              <p className="text-gray-700">{[fmtDoc(g.client.document), g.client.phone1].filter(Boolean).join(' · ')}</p>
            </div>
            <table className="w-full">
              <thead><tr><th className={th}>Fatura</th><th className={th}>Referência</th><th className={th}>Operação</th><th className={th}>Vencimento</th><th className={`${th} text-right`}>Atraso</th><th className={`${th} text-right`}>Valor</th></tr></thead>
              <tbody>
                {g.items.map((i) => (
                  <tr key={i.id} className="border-b border-gray-200">
                    <td className={`${td} font-mono`}>{String(i.number).padStart(6, '0')}</td>
                    <td className={td}>{i.ref}</td>
                    <td className={td}>{i.operation ?? '—'}</td>
                    <td className={`${td} ${i.late ? 'font-bold text-red-700' : ''}`}>{fmtDate(i.dueDate)}</td>
                    <td className={`${td} text-right`}>{i.late ? `${i.late} dia(s)` : '—'}</td>
                    <td className={`${td} text-right font-semibold`}>{fmtMoney(i.amountCents)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className={td} colSpan={4}>Subtotal{g.overdueCents ? ` · vencido ${fmtMoney(g.overdueCents)}` : ''}{g.openCents ? ` · a vencer ${fmtMoney(g.openCents)}` : ''}</td>
                  <td className={`${td} text-right`}>{g.maxLate ? `até ${g.maxLate} dia(s)` : ''}</td>
                  <td className={`${td} text-right`}>{fmtMoney(g.overdueCents + g.openCents)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}

        {list.length > 0 && (
          <div className="mt-4 flex justify-end border-t-2 border-black pt-2 text-sm font-bold">TOTAL GERAL EM ABERTO: {fmtMoney(totals.total)}</div>
        )}
      </article>
    </main>
  );
}
