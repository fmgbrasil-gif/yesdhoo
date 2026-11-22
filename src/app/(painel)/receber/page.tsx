import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronDown, FileDown, MessageCircle, Printer, Search } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDate, fmtMoney } from '@/lib/money';
import { fmtDoc } from '@/lib/docs';
import { openDebts } from '@/lib/receivables';
import { Empty, PageHeader } from '@/components/basic';
import { InvoiceActions } from '@/components/InvoiceActions';
import { FinanceButtons } from '@/components/FinanceButtons';
import { bankOf } from '@/lib/billing';
import { localDate } from '@/lib/util';
import { PeriodBar } from '@/components/PeriodBar';
import { periodHref, resolvePeriod } from '@/lib/period';
import { invoicePeriod, SITUACOES } from '@/lib/receivables';

export const metadata = { title: 'Contas a receber' };

export default async function ReceberPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const per = resolvePeriod(sp, localDate());
  const por = sp.por === 'ref' ? 'ref' : undefined;
  const f = { cliente: sp.cliente, operacao: sp.operacao, situacao: sp.situacao ?? '', de: per.de, ate: per.ate, por };
  const tid = user.tenantId;
  const [{ list, totals }, operations, accounts, services, clients, subs] = await Promise.all([
    openDebts(tid, f),
    db.operation.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.bankAccount.findMany({ where: { tenantId: tid, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true } }),
    db.service.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, priceCents: true } }),
    db.client.findMany({ where: { tenantId: tid, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.subscription.findMany({ where: { tenantId: tid, status: 'ativa' }, orderBy: { createdAt: 'desc' }, include: { client: { select: { name: true } } } }),
  ]);
  const today = localDate();
  const hasBank = !!bankOf(user.tenant);
  // totais do periodo, iguais aos do Financeiro
  const inDue = !por && per.de && per.ate ? { gte: per.de, lte: per.ate } : undefined;
  const ref = por ? invoicePeriod('ref', per.de, per.ate) : {};
  const sum = (w: object) => db.invoice.aggregate({ where: { tenantId: tid, ...ref, ...w }, _sum: { amountCents: true, paidCents: true }, _count: true });
  const [kOpen, kLate, kPaid] = await Promise.all([
    sum({ status: 'aberta', dueDate: { ...(inDue ?? {}), gte: inDue && inDue.gte > today ? inDue.gte : today } }),
    sum({ status: 'aberta', dueDate: { ...(inDue ?? {}), lt: today } }),
    sum({ status: 'paga', ...(por ? {} : per.paidAt ? { paidAt: per.paidAt } : {}) }),
  ]);
  const keep = { situacao: f.situacao || undefined, operacao: f.operacao, cliente: f.cliente, por };
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const company = user.tenant.tradeName || user.tenant.name;
  const qs = new URLSearchParams(Object.entries({ ...per.params, ...keep }).filter(([, v]) => v) as [string, string][]).toString();
  const wa = (g: (typeof list)[number]) => {
    const d = (g.client.phone1 ?? '').replace(/\D/g, '');
    const phone = d.length >= 10 ? (d.startsWith('55') && d.length >= 12 ? d : `55${d}`) : '';
    const text = [
      `Olá, *${g.client.tradeName || g.client.name}*!`,
      `Consta(m) em aberto com a *${company}*:`,
      '',
      ...g.items.filter((i) => i.state === 'aberta' || i.state === 'vencida').map((i) => `*Fatura nº ${i.number}* (${i.ref}) — vence ${fmtDate(i.dueDate)}${i.late ? ` (*${i.late} dia(s) em atraso*)` : ''} — ${fmtMoney(i.amountCents)}\nPagar com Pix: ${origin}${i.link}/pagar`),
      '',
      `*TOTAL EM ABERTO:* ${fmtMoney(g.overdueCents + g.openCents)}`,
      '',
      'Se já pagou, desconsidere esta mensagem. Obrigado!',
    ].join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <>
      <PageHeader title="Contas a receber" crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Contas a receber' }]}>
        <a href={`/relatorio/receber${qs ? `?${qs}` : ''}`} target="_blank" rel="noreferrer" className="btn-ghost"><Printer size={16} /> Gerar relatório</a>
        <a href={`/relatorio/receber/planilha${qs ? `?${qs}` : ''}`} className="btn-ghost"><FileDown size={16} /> Planilha (CSV)</a>
        <FinanceButtons clients={clients} subs={subs} services={services} operations={operations} today={today} />
      </PageHeader>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="label">Consultar por</span>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900" role="radiogroup" aria-label="Consultar por">
          {([[undefined, 'Vencimento'], ['ref', 'Mês de referência']] as const).map(([k, l]) => (
            <Link key={l} href={periodHref('/receber', per, { ...keep, por: k })} role="radio" aria-checked={por === k} className={`rounded-md px-3 py-1 font-semibold ${por === k ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500'}`}>{l}</Link>
          ))}
        </div>
        {por && <span className="text-xs text-ink-400">Faturas pelo mês a que se referem (ex.: “novembro/2026”); avulsas usam o mês do vencimento.</span>}
      </div>
      <PeriodBar base="/receber" p={per} keep={keep} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="label">A receber{per.de ? ' no período' : ''}</p><p className="text-2xl font-black tabular-nums">{fmtMoney(kOpen._sum.amountCents)}</p><p className="text-xs text-ink-400">{kOpen._count} fatura(s) no prazo</p></div>
        <div className="card p-4"><p className="label text-red-600">Vencido{per.de ? ' no período' : ''}</p><p className="text-2xl font-black tabular-nums text-red-600">{fmtMoney(kLate._sum.amountCents)}</p><p className="text-xs text-ink-400">{kLate._count} fatura(s) em atraso</p></div>
        <div className="card p-4"><p className="label text-emerald-600">Recebido{per.de ? ' no período' : ''}</p><p className="text-2xl font-black tabular-nums text-emerald-600">{fmtMoney(kPaid._sum.paidCents)}</p><p className="text-xs text-ink-400">{kPaid._count} pagamento(s)</p></div>
        <div className="card p-4"><p className="label">Clientes com débito</p><p className="text-2xl font-black tabular-nums">{totals.debtors}</p><p className="text-xs text-ink-400">{fmtMoney(totals.debt)} em aberto na lista</p></div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-ink-100 dark:border-ink-700">
        <span className="border-b-2 border-brand-500 px-3 pb-2 text-sm font-semibold text-ink-900 dark:text-white">Faturas por cliente</span>
        <Link href="/financeiro?aba=recorrencias" className="border-b-2 border-transparent px-3 pb-2 text-sm font-semibold text-ink-400 hover:text-ink-700">Recorrências e períodos</Link>
        <Link href="/financeiro?aba=contratos" className="border-b-2 border-transparent px-3 pb-2 text-sm font-semibold text-ink-400 hover:text-ink-700">Contratos</Link>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700">
          {SITUACOES.map(([k, l]) => <Link key={k} href={periodHref('/receber', per, { ...keep, situacao: k || undefined })} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${f.situacao === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{l}</Link>)}
        </div>
        <form className="flex flex-wrap items-end gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {Object.entries({ ...per.params, situacao: f.situacao || undefined, por }).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {operations.length > 0 && <select name="operacao" defaultValue={f.operacao ?? ''} aria-label="Operação" className="input w-56"><option value="">Todas as operações</option>{operations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
          <input name="cliente" defaultValue={f.cliente} placeholder="Cliente ou parceiro..." aria-label="Cliente" className="input w-56" />
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
          {(f.cliente || f.operacao) && <Link href={periodHref('/receber', per, { situacao: f.situacao || undefined, por })} className="btn-ghost">Limpar</Link>}
        </form>
        {list.length === 0 ? <Empty title="Nenhum débito em aberto" text="Todos os clientes estão em dia com os filtros escolhidos." /> : (
          <ul className="space-y-4 p-3 sm:p-4">
            {list.map((g) => (
              <li key={g.client.id} className="overflow-hidden rounded-xl border-[3px] border-brand-500 bg-white shadow-sm dark:border-brand-400 dark:bg-ink-800">
                <details className="group" open>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 bg-brand-50 p-4 hover:bg-brand-100 dark:bg-ink-900 dark:hover:bg-ink-700/40">
                    <ChevronDown size={16} className="shrink-0 -rotate-90 text-ink-400 transition-transform group-open:rotate-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{g.client.tradeName || g.client.name}</span>
                      <span className="text-xs text-ink-400">{[fmtDoc(g.client.document), g.client.phone1, `${g.items.length} fatura(s)`].filter(Boolean).join(' · ')}</span>
                    </span>
                    {g.maxLate > 0 && <span className="badge bg-red-100 text-red-700">{g.maxLate} dia(s) de atraso</span>}
                    <span className="w-28 text-right text-sm tabular-nums text-red-600">{g.overdueCents ? fmtMoney(g.overdueCents) : ''}<span className="block text-[10px] uppercase text-ink-400">{g.overdueCents ? 'vencido' : ''}</span></span>
                    <span className="w-28 text-right text-sm tabular-nums text-sky-700">{g.openCents ? fmtMoney(g.openCents) : ''}<span className="block text-[10px] uppercase text-ink-400">{g.openCents ? 'a vencer' : ''}</span></span>
                    {g.paidCents > 0 && <span className="w-28 text-right text-sm tabular-nums text-emerald-600">{fmtMoney(g.paidCents)}<span className="block text-[10px] uppercase text-ink-400">recebido</span></span>}
                    <span className="w-32 text-right font-black tabular-nums">{fmtMoney(g.overdueCents + g.openCents + g.paidCents + g.otherCents)}</span>
                    {g.overdueCents + g.openCents > 0 && <a href={wa(g)} target="_blank" rel="noreferrer" className="btn bg-emerald-600 !py-1.5 text-white hover:bg-emerald-500" title="Cobrar pelo WhatsApp"><MessageCircle size={15} /> Cobrar</a>}
                  </summary>
                  <table className="mb-3 hidden w-full text-sm md:table">
                    <thead><tr className="text-left"><th className="th pl-8">Fatura</th><th className="th">Referência</th><th className="th">Vencimento</th><th className="th">Atraso / situação</th><th className="th text-right">Valor</th><th className="th text-right">Ações</th></tr></thead>
                    <tbody>
                      {g.items.map((i) => (
                        <tr key={i.id} className="border-t border-ink-100 dark:border-ink-700">
                          <td className="td pl-8 font-mono">{String(i.number).padStart(6, '0')}</td>
                          <td className="td">{i.ref}{i.operation && <span className="block text-xs text-ink-400">{i.operation}</span>}</td>
                          <td className={`td ${i.late ? 'font-semibold text-red-600' : ''}`}>{fmtDate(i.dueDate)}</td>
                          <td className="td">{i.state === 'paga' ? <span className="badge bg-emerald-100 text-emerald-700">Paga</span> : i.state === 'cancelada' ? <span className="badge bg-ink-100 text-ink-500">Cancelada</span> : i.late ? `${i.late} dia(s)` : '—'}</td>
                          <td className="td text-right font-semibold tabular-nums">{fmtMoney(i.amountCents)}</td>
                          <td className="td"><InvoiceActions inv={i.inv} today={today} accounts={accounts} services={services} hasBank={hasBank} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* celular: uma fatura por bloco */}
                  <ul className="divide-y divide-ink-100 md:hidden dark:divide-ink-700">
                    {g.items.map((i) => (
                      <li key={i.id} className="space-y-2 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">Fatura <span className="font-mono">{String(i.number).padStart(6, '0')}</span> · {i.ref}</p>
                            {i.operation && <p className="text-xs text-ink-400">{i.operation}</p>}
                            <p className={`text-xs ${i.late ? 'font-semibold text-red-600' : 'text-ink-500'}`}>Vence {fmtDate(i.dueDate)}{i.late ? ` · ${i.late} dia(s) de atraso` : ''}{i.state === 'paga' ? ' · paga' : i.state === 'cancelada' ? ' · cancelada' : ''}</p>
                          </div>
                          <p className="shrink-0 font-black tabular-nums">{fmtMoney(i.amountCents)}</p>
                        </div>
                        <InvoiceActions inv={i.inv} today={today} accounts={accounts} services={services} hasBank={hasBank} />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-400">Ao registrar o pagamento, o valor entra no caixa da operação da fatura (ex.: Caixa SkyFit) ou na conta padrão.</p>
    </>
  );
}
