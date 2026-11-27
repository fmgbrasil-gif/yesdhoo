import Link from 'next/link';
import { SIGN_LABEL } from '@/lib/contract-sign';
import { Ban, Pencil, FileSignature, FileText, Repeat, Search } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db, like } from '@/lib/db';
import { localDate } from '@/lib/util';
import { fmtDate, fmtMoney } from '@/lib/money';
import { bankOf, competenceLabel, invoiceItems, invoiceState, METHODS, runRecurring, STATE_LABEL, SUB_MODE } from '@/lib/billing';
import { Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionForm, Field, Modal } from '@/components/ui';
import { cancelCharge, updateCharge } from './actions';
import { InvoiceItems } from '@/components/InvoiceItems';
import { MoneyInput } from '@/components/MoneyInput';
import { InvoiceActions } from '@/components/InvoiceActions';
import { FinanceButtons } from '@/components/FinanceButtons';
import { OperationAccountFields } from '@/components/ChargeForm';
import { opDescription } from '@/lib/op-text';
import { PeriodBar } from '@/components/PeriodBar';
import { periodHref, resolvePeriod } from '@/lib/period';
import { kindLabel } from '@/lib/client-kind';
import { OperationBadge } from '@/components/OperationBadge';

// a geracao de contrato com IA pode levar ate ~2 minutos
export const maxDuration = 300;

const BADGE: Record<string, string> = {
  aberta: 'bg-sky-100 text-sky-700', vencida: 'bg-red-100 text-red-700', paga: 'bg-emerald-100 text-emerald-700', cancelada: 'bg-ink-100 text-ink-500',
};

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const tid = user.tenantId;
  await runRecurring(tid); // garante as faturas recorrentes do mes mesmo sem a rotina diaria
  const tab = sp.aba === 'recorrencias' || sp.aba === 'contratos' ? sp.aba : 'faturas';
  const today = localDate();
  const { page, size, skip, take } = pageParams(sp);
  // padrao: Em aberto (tudo o que nao foi pago); "todas" mostra tudo menos o arquivo morto
  const status = sp.situacao === 'todas' ? '' : sp.situacao || 'aberta';
  const accounts = await db.bankAccount.findMany({ where: { tenantId: tid, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, isDefault: true } });
  const operations = await db.operation.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' }, select: { id: true, name: true, accountId: true } });
  // periodo de consulta: um mes (padrao: o atual), um intervalo personalizado ou todo o periodo
  const per = resolvePeriod(sp, today);
  const { de, ate } = per;
  const paidPeriod = per.paidAt ? { paidAt: per.paidAt } : {};
  const qs = (extra: Record<string, string | undefined>) => periodHref('/financeiro', per, extra);
  const where = {
    tenantId: tid,
    ...(status === 'vencida' ? { status: 'aberta', dueDate: { lt: today } } : status === 'aberta' ? { status: 'aberta' } : status === 'paga' || status === 'cancelada' ? { status } : { status: { not: 'cancelada' } }), // canceladas ficam no arquivo morto
    ...(sp.cliente ? { client: { name: like(sp.cliente) } } : {}),
  };
  const periodWhere = (w: { dueDate?: { gte?: string; lt?: string } }) => {
    if (!de || !ate) return w;
    const r = { gte: de, lte: ate, ...(w.dueDate?.gte && w.dueDate.gte > de ? { gte: w.dueDate.gte } : {}), ...(w.dueDate?.lt ? { lt: w.dueDate.lt } : {}) };
    return { ...w, dueDate: r };
  };
  if (status === 'aberta') {
    // em aberto: o que vence no periodo e tambem as vencidas de antes (divida nao some ao trocar de mes)
    if (de && ate) Object.assign(where, { dueDate: { lte: ate }, OR: [{ dueDate: { gte: de } }, { dueDate: { lt: today } }] });
  } else Object.assign(where, periodWhere(where as { dueDate?: { gte?: string; lt?: string } }));
  const sum = (w: object) => db.invoice.aggregate({ where: { tenantId: tid, ...w }, _sum: { amountCents: true }, _count: true });
  const [rows, total, open, overdue, paidMonth, clients] = await Promise.all([
    db.invoice.findMany({ where, skip, take, orderBy: status === 'aberta' || status === 'vencida' ? [{ dueDate: 'asc' }, { number: 'asc' }] : [{ dueDate: 'desc' }, { number: 'desc' }], include: { client: { select: { name: true, kind: true, document: true } }, operation: { select: { name: true, accountId: true } }, subscription: { select: { status: true } } } }),
    db.invoice.count({ where }),
    sum(periodWhere({ status: 'aberta', dueDate: { gte: today } } as never)),
    sum(periodWhere({ status: 'aberta', dueDate: { lt: today } } as never)),
    db.invoice.aggregate({ where: { tenantId: tid, status: 'paga', ...paidPeriod }, _sum: { paidCents: true }, _count: true }),
    db.client.findMany({ where: { tenantId: tid, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
  ]);
  const subs = await db.subscription.findMany({
    where: { tenantId: tid }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { client: { select: { name: true, kind: true, active: true } }, operation: { select: { name: true } }, invoices: { select: { status: true, dueDate: true } } },
  });
  const services = (await db.service.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' } })).map((x) => ({ id: x.id, name: x.name, unit: x.unit, priceCents: x.priceCents }));
  const contracts = tab === 'contratos' ? await db.contract.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'desc' }, include: { client: { select: { name: true } } } }) : [];
  const activeSubs = subs.filter((s) => s.status === 'ativa');
  const tabLink = (k: string, label: string, n?: number) => (
    <Link href={k === 'faturas' ? '/financeiro' : `/financeiro?aba=${k}`} aria-current={tab === k ? 'page' : undefined}
      className={`border-b-2 px-3 pb-2 text-sm font-semibold ${tab === k ? 'border-brand-500 text-ink-900 dark:text-white' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>{label}{n != null && <span className="ml-1 opacity-60">{n}</span>}</Link>
  );
  const hasBank = !!bankOf(user.tenant);
  const noPix = !user.tenant.pixKey && !hasBank;
  const filters = [['aberta', 'Em aberto'], ['vencida', 'Vencidas'], ['paga', 'Pagas'], ['todas', 'Todas'], ['cancelada', 'Arquivo morto']];

  return (
    <>
      <PageHeader title="Financeiro" crumbs={[{ label: 'Financeiro' }, { label: 'Contas a receber' }]}>
        <FinanceButtons clients={clients} subs={activeSubs} services={services} operations={operations} accounts={accounts} today={today} />
      </PageHeader>

      {noPix && <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-800 dark:text-ink-200">Cadastre sua chave Pix em <Link href="/empresa#cobranca" className="font-semibold underline">Minha empresa</Link> para que as faturas saiam com QR Code de pagamento.</p>}

      <PeriodBar base="/financeiro" p={per} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-ink-400">A receber{de ? ' no período' : ''}</p><p className="text-2xl font-black tabular-nums">{fmtMoney(open._sum.amountCents)}</p><p className="text-xs text-ink-400">{open._count} fatura(s) no prazo</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-red-600">Vencido{de ? ' no período' : ''}</p><p className="text-2xl font-black tabular-nums text-red-600">{fmtMoney(overdue._sum.amountCents)}</p><p className="text-xs text-ink-400">{overdue._count} fatura(s) em atraso</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-emerald-600">Recebido{de ? ' no período' : ''}</p><p className="text-2xl font-black tabular-nums text-emerald-600">{fmtMoney(paidMonth._sum.paidCents)}</p><p className="text-xs text-ink-400">{paidMonth._count} pagamento(s)</p></div>
      </div>

      <nav className="mb-4 flex gap-2 border-b border-ink-100 dark:border-ink-700" aria-label="Seções do financeiro">
        {tabLink('faturas', 'Faturas')}{tabLink('recorrencias', 'Recorrências e períodos', activeSubs.length)}{tabLink('contratos', 'Contratos')}
      </nav>

      {tab === 'recorrencias' && (
        <div className="card overflow-hidden">
          {subs.length === 0 ? <Empty title="Nenhuma cobrança recorrente" text="Use “Nova cobrança” e escolha Por período ou Recorrente." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Cliente</th><th className="th">Tipo</th><th className="th text-right">Valor mensal</th><th className="th">Vencimento</th><th className="th">Faturas</th><th className="th">Situação</th><th className="th text-right">Ações</th></tr></thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {subs.map((s) => {
                    const paid = s.invoices.filter((i) => i.status === 'paga').length;
                    const late = s.invoices.filter((i) => i.status === 'aberta' && i.dueDate < today).length;
                    return (
                      <tr key={s.id} className={s.status === 'ativa' ? '' : 'opacity-60'}>
                        <td className="td"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s.client.name}</span><OperationBadge name={s.operation?.name} /></span><span className="text-xs text-ink-400">{kindLabel(s.client.kind)}{!s.client.active && ' · desativado'}</span></td>
                        <td className="td"><span className="inline-flex items-center gap-1">{s.mode === 'recorrente' && <Repeat size={13} />}{SUB_MODE(s)}</span><span className="block text-xs text-ink-400">desde {competenceLabel(s.startMonth)}</span></td>
                        <td className="td text-right font-semibold tabular-nums">{fmtMoney(s.amountCents)}</td>
                        <td className="td">dia {s.dueDay}</td>
                        <td className="td tabular-nums">{s.invoices.length}{s.mode === 'periodo' && `/${s.months}`} geradas<span className="block text-xs text-ink-400">{paid} paga(s){late > 0 && <b className="text-red-600"> · {late} vencida(s)</b>}</span></td>
                        <td className="td">{s.status === 'ativa' ? <span className="badge bg-emerald-100 text-emerald-700">Ativa</span> : <><span className="badge bg-ink-100 text-ink-500">Cancelada</span><span className="block text-xs text-ink-400">{s.cancelledAt?.toLocaleDateString('pt-BR')}{s.cancelReason ? ` · ${s.cancelReason}` : ''}</span></>}</td>
                        <td className="td">
                          <div className="flex justify-end gap-1.5">
                            <Link href={`/financeiro?situacao=&cliente=${encodeURIComponent(s.client.name)}`} className="btn-icon" title="Ver faturas" aria-label="Ver faturas"><FileText size={15} /></Link>
                            {s.status === 'ativa' && (
                              <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar cobrança" title={`Editar cobrança de ${s.client.name}`} wide>
                                <ActionForm action={updateCharge}>
                                  <input type="hidden" name="id" value={s.id} />
                                  <p className="text-sm text-ink-500">{SUB_MODE(s)} desde {competenceLabel(s.startMonth)}. As mudanças valem para as próximas faturas.</p>
                                  <OperationAccountFields operations={operations} accounts={accounts} operationId={s.operationId} accountId={s.accountId} />
                                  <Field label="Dia do vencimento"><input type="number" name="dueDay" min={1} max={28} required defaultValue={s.dueDay} className="input w-32" /></Field>
                                  <InvoiceItems initial={invoiceItems(s)} services={services} extraSuggestions={operations.map((o) => opDescription(o.name))} />
                                  <Field label="Observações"><textarea name="notes" rows={2} defaultValue={s.notes} className="input" /></Field>
                                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="applyOpen" defaultChecked className="h-4 w-4" /> Aplicar também às faturas em aberto que ainda não venceram</label>
                                </ActionForm>
                              </Modal>
                            )}
                            {s.status === 'ativa' && (
                              <Modal trigger={<Ban size={15} />} triggerClass="btn-icon !text-red-600" titleAttr="Cancelar recorrência" title={`Cancelar cobrança de ${s.client.name}?`}>
                                <ActionForm action={cancelCharge} submit="Cancelar recorrência" submitClass="btn-danger" cancel>
                                  <input type="hidden" name="id" value={s.id} />
                                  <p className="text-sm text-ink-500">A cobrança é encerrada e <b>todas as faturas futuras em aberto</b> dela são canceladas (vão para o arquivo morto). Faturas pagas e vencidas continuam no financeiro.</p>
                                  <Field label="Motivo (opcional)"><input name="reason" className="input" placeholder="Ex.: cliente desistiu" /></Field>
                                </ActionForm>
                              </Modal>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-ink-100 p-3 text-xs text-ink-400 dark:border-ink-700">As cobranças recorrentes mantêm sempre 12 faturas projetadas à frente: no último dia de cada mês o sistema gera mais uma. Por período, todas as parcelas são geradas na criação.</p>
        </div>
      )}

      {tab === 'contratos' && (
        <div className="card overflow-hidden">
          {contracts.length === 0 ? <Empty title="Nenhum contrato" text="Use “Contrato com IA” para redigir o primeiro." /> : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-700">
              {contracts.map((c) => (
                <li key={c.id}><Link href={`/contratos/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-ink-50 dark:hover:bg-ink-700/40"><span><span className="block font-semibold">{c.title}</span><span className="text-xs text-ink-400">{c.client.name} · criado em {c.createdAt.toLocaleDateString('pt-BR')}</span></span><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.signStatus === 'assinado' ? 'bg-emerald-100 text-emerald-700' : c.signStatus === 'recusado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{SIGN_LABEL[c.signStatus] ?? c.signStatus}</span><FileSignature size={18} className="shrink-0 text-ink-300" /></Link></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'faturas' && <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700">
          {filters.map(([k, label]) => (
            <Link key={k} href={qs({ situacao: k === 'aberta' ? undefined : k })} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${(status || 'todas') === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label}</Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {status !== 'aberta' && <input type="hidden" name="situacao" value={status || 'todas'} />}
          {Object.entries(per.params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="cliente" defaultValue={sp.cliente} placeholder="Cliente ou parceiro..." className="input w-56" aria-label="Cliente ou parceiro" />
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
        </form>
        {rows.length === 0 ? <Empty title="Nenhuma fatura" text="Use “Nova cobrança” para criar uma fatura avulsa, por período ou recorrente." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Nº</th><th className="th">Cliente</th><th className="th">Vencimento</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((inv) => {
                  const st = invoiceState(inv);
                  return (
                    <tr key={inv.id}>
                      <td className="td font-mono text-ink-500">{String(inv.number).padStart(5, '0')}</td>
                      <td className="td"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{inv.client.name}</span><OperationBadge name={inv.operation?.name} /></span><span className="text-xs text-ink-400">{kindLabel(inv.client.kind)}{inv.installment ? ` · parcela ${inv.installment}` : inv.subscriptionId ? ` · recorrente ${inv.competence?.split('-').reverse().join('/')}` : ''}</span></td>
                      <td className="td tabular-nums">{fmtDate(inv.dueDate)}</td>
                      <td className="td text-right font-semibold tabular-nums">{fmtMoney(inv.amountCents)}</td>
                      <td className="td">
                        <span className={`badge ${BADGE[st]}`}>{STATE_LABEL[st]}</span>
                        {inv.status === 'paga' && <span className="block text-xs text-ink-400">{inv.paidAt?.toLocaleDateString('pt-BR')}{inv.paymentMethod ? ` · ${METHODS[inv.paymentMethod]}` : ''}</span>}
                        {inv.bankChargeId && <span className="block text-xs text-ink-400">boleto emitido</span>}
                      </td>
                      <td className="td">
                        <InvoiceActions inv={inv} today={today} accounts={accounts} operations={operations} services={services} hasBank={hasBank} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} size={size} total={total} params={sp} base="/financeiro" />
      </div>}
    </>
  );
}
