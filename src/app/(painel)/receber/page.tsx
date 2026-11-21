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

export const metadata = { title: 'Contas a receber' };

export default async function ReceberPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const f = { cliente: sp.cliente, operacao: sp.operacao, situacao: sp.situacao, ate: sp.ate, futuras: sp.futuras };
  const tid = user.tenantId;
  const [{ list, totals, ate }, operations, accounts, services, clients, subs] = await Promise.all([
    openDebts(tid, f),
    db.operation.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.bankAccount.findMany({ where: { tenantId: tid, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true } }),
    db.service.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, priceCents: true } }),
    db.client.findMany({ where: { tenantId: tid, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.subscription.findMany({ where: { tenantId: tid, status: 'ativa' }, orderBy: { createdAt: 'desc' }, include: { client: { select: { name: true } } } }),
  ]);
  const today = localDate();
  const hasBank = !!bankOf(user.tenant);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const company = user.tenant.tradeName || user.tenant.name;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const sits: [string, string][] = [['', 'Todos em aberto'], ['vencidas', 'Só vencidos'], ['avencer', 'Só a vencer']];
  const wa = (g: (typeof list)[number]) => {
    const d = (g.client.phone1 ?? '').replace(/\D/g, '');
    const phone = d.length >= 10 ? (d.startsWith('55') && d.length >= 12 ? d : `55${d}`) : '';
    const text = [
      `Olá, *${g.client.tradeName || g.client.name}*!`,
      `Consta(m) em aberto com a *${company}*:`,
      '',
      ...g.items.map((i) => `*Fatura nº ${i.number}* (${i.ref}) — vence ${fmtDate(i.dueDate)}${i.late ? ` (*${i.late} dia(s) em atraso*)` : ''} — ${fmtMoney(i.amountCents)}\nPagar com Pix: ${origin}${i.link}/pagar`),
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

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="label">Total em aberto</p><p className="text-2xl font-black tabular-nums">{fmtMoney(totals.total)}</p><p className="text-xs text-ink-400">{totals.invoices} fatura(s)</p></div>
        <div className="card p-4"><p className="label text-red-600">Vencido</p><p className="text-2xl font-black tabular-nums text-red-600">{fmtMoney(totals.overdue)}</p><p className="text-xs text-ink-400">em atraso</p></div>
        <div className="card p-4"><p className="label text-sky-600">A vencer</p><p className="text-2xl font-black tabular-nums text-sky-700">{fmtMoney(totals.open)}</p><p className="text-xs text-ink-400">{ate ? `vencendo até ${fmtDate(ate)}` : 'incluindo as projetadas'}</p></div>
        <div className="card p-4"><p className="label">Clientes com débito</p><p className="text-2xl font-black tabular-nums">{totals.clients}</p><p className="text-xs text-ink-400">com faturas em aberto</p></div>
      </div>

      <div className="card overflow-hidden">
        <form className="flex flex-wrap items-end gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          <label className="text-xs text-ink-400">Situação<select name="situacao" defaultValue={f.situacao ?? ''} className="input">{sits.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {operations.length > 0 && <label className="text-xs text-ink-400">Operação<select name="operacao" defaultValue={f.operacao ?? ''} className="input"><option value="">Todas</option>{operations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
          <label className="text-xs text-ink-400">Vencimento até<input type="date" name="ate" defaultValue={f.ate} className="input" /></label>
          <input name="cliente" defaultValue={f.cliente} placeholder="Cliente..." aria-label="Cliente" className="input w-56" />
          <label className="flex items-center gap-2 self-center text-sm"><input type="checkbox" name="futuras" value="1" defaultChecked={f.futuras === '1'} className="h-4 w-4 accent-violet-600" /> Incluir faturas futuras projetadas</label>
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
          {qs && <Link href="/receber" className="btn-ghost">Limpar</Link>}
        </form>
        {list.length === 0 ? <Empty title="Nenhum débito em aberto" text="Todos os clientes estão em dia com os filtros escolhidos." /> : (
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {list.map((g) => (
              <li key={g.client.id}>
                <details className="group" open>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 hover:bg-ink-50 dark:hover:bg-ink-700/40">
                    <ChevronDown size={16} className="shrink-0 -rotate-90 text-ink-400 transition-transform group-open:rotate-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{g.client.tradeName || g.client.name}</span>
                      <span className="text-xs text-ink-400">{[fmtDoc(g.client.document), g.client.phone1, `${g.items.length} fatura(s)`].filter(Boolean).join(' · ')}</span>
                    </span>
                    {g.maxLate > 0 && <span className="badge bg-red-100 text-red-700">{g.maxLate} dia(s) de atraso</span>}
                    <span className="w-28 text-right text-sm tabular-nums text-red-600">{g.overdueCents ? fmtMoney(g.overdueCents) : ''}<span className="block text-[10px] uppercase text-ink-400">{g.overdueCents ? 'vencido' : ''}</span></span>
                    <span className="w-28 text-right text-sm tabular-nums text-sky-700">{g.openCents ? fmtMoney(g.openCents) : ''}<span className="block text-[10px] uppercase text-ink-400">{g.openCents ? 'a vencer' : ''}</span></span>
                    <span className="w-32 text-right font-black tabular-nums">{fmtMoney(g.overdueCents + g.openCents)}</span>
                    <a href={wa(g)} target="_blank" rel="noreferrer" className="btn bg-emerald-600 !py-1.5 text-white hover:bg-emerald-500" title="Cobrar pelo WhatsApp"><MessageCircle size={15} /> Cobrar</a>
                  </summary>
                  <table className="mb-3 w-full text-sm">
                    <thead><tr className="text-left"><th className="th pl-8">Fatura</th><th className="th">Referência</th><th className="th">Vencimento</th><th className="th">Atraso</th><th className="th text-right">Valor</th><th className="th text-right">Ações</th></tr></thead>
                    <tbody>
                      {g.items.map((i) => (
                        <tr key={i.id} className="border-t border-ink-100 dark:border-ink-700">
                          <td className="td pl-8 font-mono">{String(i.number).padStart(6, '0')}</td>
                          <td className="td">{i.ref}{i.operation && <span className="block text-xs text-ink-400">{i.operation}</span>}</td>
                          <td className={`td ${i.late ? 'font-semibold text-red-600' : ''}`}>{fmtDate(i.dueDate)}</td>
                          <td className="td">{i.late ? `${i.late} dia(s)` : '—'}</td>
                          <td className="td text-right font-semibold tabular-nums">{fmtMoney(i.amountCents)}</td>
                          <td className="td"><InvoiceActions inv={i.inv} today={today} accounts={accounts} services={services} hasBank={hasBank} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
