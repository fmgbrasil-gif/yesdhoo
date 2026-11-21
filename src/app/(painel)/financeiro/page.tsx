import Link from 'next/link';
import { SIGN_LABEL } from '@/lib/contract-sign';
import { Ban, Banknote, CheckCircle2, Pencil, ExternalLink, FileSignature, FileText, Plus, RefreshCw, Repeat, Search, Settings, Undo2, RotateCcw, ChevronLeft, ChevronRight, CalendarRange, Zap } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db, like } from '@/lib/db';
import { localDate } from '@/lib/util';
import { fmtDate, fmtMoney } from '@/lib/money';
import { addMonths, bankOf, competenceLabel, invoiceItems, invoiceLink, invoiceState, METHODS, runRecurring, STATE_LABEL, SUB_MODE } from '@/lib/billing';
import { Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { ChargeFields } from '@/components/ChargeForm';
import { boletoInvoice, cancelCharge, cancelInvoice, generateContract, payInvoice, reopenInvoice, saveCharge, syncInvoice, updateCharge, updateInvoice, reactivateInvoice } from './actions';
import { InvoiceItems } from '@/components/InvoiceItems';
import { MoneyInput } from '@/components/MoneyInput';
import { PixButton } from '@/components/PixPanel';

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
  const month = today.slice(0, 7);
  const { page, size, skip, take } = pageParams(sp);
  const status = sp.situacao;
  const accounts = await db.bankAccount.findMany({ where: { tenantId: tid, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true } });
  // periodo de consulta: um mes (padrao: o atual), um intervalo personalizado ou todo o periodo
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const all = sp.mes === 'todos';
  const custom = !all && (D.test(sp.de ?? '') || D.test(sp.ate ?? ''));
  const mes = !all && !custom && /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : month;
  const lastDay = (ym: string) => `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  const de = all ? null : custom ? (D.test(sp.de ?? '') ? sp.de! : '2000-01-01') : `${mes}-01`;
  const ate = all ? null : custom ? (D.test(sp.ate ?? '') ? sp.ate! : '2100-12-31') : lastDay(mes);
  const inPeriod = de && ate ? { dueDate: { gte: de, lte: ate } } : {};
  const paidPeriod = de && ate ? { paidAt: { gte: new Date(`${de}T00:00:00-03:00`), lte: new Date(`${ate}T23:59:59-03:00`) } } : {};
  const periodParams: Record<string, string> = all ? { mes: 'todos' } : custom ? { ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) } : mes === month ? {} : { mes };
  const qs = (extra: Record<string, string | undefined>) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries({ ...periodParams, ...extra })) if (v) q.set(k, v); const t = q.toString(); return t ? `/financeiro?${t}` : '/financeiro'; };
  const monthName = (ym: string) => { const t = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`)); return t[0].toUpperCase() + t.slice(1); };
  const where = {
    tenantId: tid,
    ...(status === 'vencida' ? { status: 'aberta', dueDate: { lt: today } } : status === 'aberta' ? { status: 'aberta', dueDate: { gte: today } } : status === 'paga' || status === 'cancelada' ? { status } : { status: { not: 'cancelada' } }), // canceladas ficam no arquivo morto
    ...(sp.cliente ? { client: { name: like(sp.cliente) } } : {}),
  };
  const periodWhere = (w: { dueDate?: { gte?: string; lt?: string } }) => {
    if (!de || !ate) return w;
    const r = { gte: de, lte: ate, ...(w.dueDate?.gte && w.dueDate.gte > de ? { gte: w.dueDate.gte } : {}), ...(w.dueDate?.lt ? { lt: w.dueDate.lt } : {}) };
    return { ...w, dueDate: r };
  };
  Object.assign(where, periodWhere(where as { dueDate?: { gte?: string; lt?: string } }));
  const sum = (w: object) => db.invoice.aggregate({ where: { tenantId: tid, ...w }, _sum: { amountCents: true }, _count: true });
  const [rows, total, open, overdue, paidMonth, clients] = await Promise.all([
    db.invoice.findMany({ where, skip, take, orderBy: [{ dueDate: 'desc' }, { number: 'desc' }], include: { client: { select: { name: true, kind: true, document: true } } } }),
    db.invoice.count({ where }),
    sum(periodWhere({ status: 'aberta', dueDate: { gte: today } } as never)),
    sum(periodWhere({ status: 'aberta', dueDate: { lt: today } } as never)),
    db.invoice.aggregate({ where: { tenantId: tid, status: 'paga', ...paidPeriod }, _sum: { paidCents: true }, _count: true }),
    db.client.findMany({ where: { tenantId: tid, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
  ]);
  const subs = await db.subscription.findMany({
    where: { tenantId: tid }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { client: { select: { name: true, kind: true, active: true } }, invoices: { select: { status: true, dueDate: true } } },
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
  const filters = [['', 'Todas'], ['aberta', 'Em aberto'], ['vencida', 'Vencidas'], ['paga', 'Pagas'], ['cancelada', 'Arquivo morto']];

  return (
    <>
      <PageHeader title="Financeiro" crumbs={[{ label: 'Financeiro' }, { label: 'Contas a receber' }]}>
        <Link href="/empresa#cobranca" className="btn-ghost"><Settings size={15} /> Pix e banco</Link>
        <Modal trigger={<><FileSignature size={16} /> Contrato com IA</>} triggerClass="btn-ghost" title="Gerar contrato com IA" wide>
          <ActionForm action={generateContract} submit="Gerar contrato">
            <p className="text-sm text-ink-500">A IA redige um contrato de prestação de serviços com os dados da sua empresa e do cliente, as condições da cobrança e os anexos que você enviar. Leva de 30 segundos a 2 minutos. Você revisa e edita antes de usar.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente ou parceiro">
                <select name="clientId" required className="input" defaultValue="">
                  <option value="" disabled>Selecione...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind === 'parceiro' ? 'parceiro' : 'cliente'})</option>)}
                </select>
              </Field>
              <Field label="Condições comerciais" hint="Valor, prazo e vencimento vêm desta cobrança">
                <select name="subscriptionId" className="input" defaultValue="">
                  <option value="">Sem cobrança (deixar valores em branco)</option>
                  {activeSubs.map((s) => <option key={s.id} value={s.id}>{s.client.name} — {SUB_MODE(s)} · {fmtMoney(s.amountCents)}/mês</option>)}
                </select>
              </Field>
            </div>
            <Field label="Instruções adicionais (opcional)" hint="Ex.: 3 telas, vídeos de até 15 segundos, exclusividade no segmento, multa de rescisão de 1 mensalidade">
              <textarea name="extra" rows={3} className="input" maxLength={2000} />
            </Field>
            <Field label="Anexos (opcional)" hint="PDF ou imagens, como um modelo de contrato, proposta ou tabela de preços. Até 5 arquivos e 4 MB no total.">
              <input type="file" name="attachments" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" className="input" />
            </Field>
            <p className="text-xs text-ink-400">Os dados da sua empresa (Minha empresa) e do cliente (Clientes e parceiros) entram no contrato automaticamente.</p>
          </ActionForm>
        </Modal>
        <Modal trigger={<><Zap size={16} /> Cobrança simples</>} triggerClass="btn-ghost" title="Cobrança simples" wide>
          <ActionForm action={saveCharge} submit="Criar cobrança">
            <p className="text-sm text-ink-500">Para clientes que já têm contrato: cria só a cobrança (avulsa, por período ou recorrente), sem contrato e sem passar pelas etapas.</p>
            <ChargeFields clients={clients} today={today} services={services} />
          </ActionForm>
        </Modal>
        <Link href="/financeiro/nova" className="btn-primary"><Plus size={16} /> Nova cobrança</Link>
      </PageHeader>

      {noPix && <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-800 dark:text-ink-200">Cadastre sua chave Pix em <Link href="/empresa#cobranca" className="font-semibold underline">Minha empresa</Link> para que as faturas saiam com QR Code de pagamento.</p>}

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <span className="label mr-1">Período</span>
        {!all && !custom && <Link href={qs({ mes: addMonths(mes, -1) })} className="btn-icon" aria-label="Mês anterior" title="Mês anterior"><ChevronLeft size={16} /></Link>}
        <span className="min-w-40 text-center font-bold">{all ? 'Todo o período' : custom ? `${fmtDate(de)} a ${fmtDate(ate)}` : monthName(mes)}</span>
        {!all && !custom && <Link href={qs({ mes: addMonths(mes, 1) })} className="btn-icon" aria-label="Próximo mês" title="Próximo mês"><ChevronRight size={16} /></Link>}
        <form className="flex items-center gap-1" action="/financeiro">
          <input type="month" name="mes" defaultValue={!all && !custom ? mes : ''} aria-label="Escolher mês" className="input !py-1.5" />
          <button className="btn-ghost !py-1.5">Ir</button>
        </form>
        <Modal trigger={<><CalendarRange size={15} /> Período personalizado</>} triggerClass="btn-ghost !py-1.5" title="Período personalizado">
          <form action="/financeiro" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="De"><input type="date" name="de" required defaultValue={de ?? ''} className="input" /></Field><Field label="Até"><input type="date" name="ate" required defaultValue={ate ?? ''} className="input" /></Field></div>
            <div className="flex justify-end"><button className="btn-primary">Aplicar</button></div>
          </form>
        </Modal>
        {(all || custom || mes !== month) && <Link href="/financeiro" className="btn-ghost !py-1.5">Mês atual</Link>}
        {!all && <Link href="/financeiro?mes=todos" className="btn-ghost !py-1.5">Todo o período</Link>}
      </div>

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
                        <td className="td"><span className="block font-semibold">{s.client.name}</span><span className="text-xs text-ink-400">{s.client.kind === 'parceiro' ? 'Parceiro' : 'Cliente'}{!s.client.active && ' · desativado'}</span></td>
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
                                  <Field label="Dia do vencimento"><input type="number" name="dueDay" min={1} max={28} required defaultValue={s.dueDay} className="input w-32" /></Field>
                                  <InvoiceItems initial={invoiceItems(s)} services={services} />
                                  <Field label="Observações"><textarea name="notes" rows={2} defaultValue={s.notes} className="input" /></Field>
                                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="applyOpen" defaultChecked className="h-4 w-4" /> Aplicar também às faturas em aberto que ainda não venceram</label>
                                </ActionForm>
                              </Modal>
                            )}
                            {s.status === 'ativa' && (
                              <Modal trigger={<Ban size={15} />} triggerClass="btn-icon !text-red-600" titleAttr="Cancelar recorrência" title={`Cancelar cobrança de ${s.client.name}?`}>
                                <ActionForm action={cancelCharge} submit="Cancelar cobrança" submitClass="btn-danger" cancel>
                                  <input type="hidden" name="id" value={s.id} />
                                  <p className="text-sm text-ink-500">O sistema para de gerar faturas para esta cobrança. Faturas já pagas e as vencidas continuam no financeiro.</p>
                                  <Field label="Motivo (opcional)"><input name="reason" className="input" placeholder="Ex.: cliente desistiu" /></Field>
                                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cancelOpen" defaultChecked className="h-4 w-4" /> Cancelar também as faturas em aberto que ainda não venceram</label>
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
          <p className="border-t border-ink-100 p-3 text-xs text-ink-400 dark:border-ink-700">As cobranças recorrentes geram a fatura do mês seguinte automaticamente no último dia de cada mês. Por período, todas as parcelas são geradas na criação.</p>
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
            <Link key={k} href={qs({ situacao: k || undefined })} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${(status ?? '') === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label}</Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {status && <input type="hidden" name="situacao" value={status} />}
          {Object.entries(periodParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
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
                      <td className="td"><span className="block font-semibold">{inv.client.name}</span><span className="text-xs text-ink-400">{inv.client.kind === 'parceiro' ? 'Parceiro' : 'Cliente'}{inv.installment ? ` · parcela ${inv.installment}` : inv.subscriptionId ? ` · recorrente ${inv.competence?.split('-').reverse().join('/')}` : ''}</span></td>
                      <td className="td tabular-nums">{fmtDate(inv.dueDate)}</td>
                      <td className="td text-right font-semibold tabular-nums">{fmtMoney(inv.amountCents)}</td>
                      <td className="td">
                        <span className={`badge ${BADGE[st]}`}>{STATE_LABEL[st]}</span>
                        {inv.status === 'paga' && <span className="block text-xs text-ink-400">{inv.paidAt?.toLocaleDateString('pt-BR')}{inv.paymentMethod ? ` · ${METHODS[inv.paymentMethod]}` : ''}</span>}
                        {inv.bankChargeId && <span className="block text-xs text-ink-400">boleto emitido</span>}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          <Link href={invoiceLink(inv)} target="_blank" className="btn-icon" title="Abrir fatura (link para o cliente)" aria-label="Abrir fatura"><FileText size={15} /></Link>
                          {inv.status === 'aberta' && (
                            <>
                              <PixButton invoiceId={inv.id} number={inv.number} />
                              <Modal trigger={<CheckCircle2 size={15} />} triggerClass="btn-icon !text-emerald-600" titleAttr="Registrar pagamento" title={`Registrar pagamento — fatura ${inv.number}`}>
                                <ActionForm action={payInvoice} submit="Confirmar pagamento">
                                  <input type="hidden" name="id" value={inv.id} />
                                  <div className="grid gap-3 sm:grid-cols-3">
                                    <Field label="Valor recebido"><MoneyInput name="paid" defaultCents={inv.amountCents} /></Field>
                                    <Field label="Data"><input type="date" name="paidAt" defaultValue={today} className="input" /></Field>
                                    <Field label="Forma"><select name="method" className="input" defaultValue="pix">{Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                                    {accounts.length > 0 && <Field label="Entrou na conta" className="sm:col-span-3"><select name="accountId" className="input" defaultValue={accounts[0].id}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
                                  </div>
                                </ActionForm>
                              </Modal>
                              {hasBank && !inv.bankChargeId && (
                                <Modal trigger={<Banknote size={15} />} triggerClass="btn-icon" titleAttr="Gerar boleto" title={`Gerar boleto — fatura ${inv.number}`}>
                                  <ActionForm action={boletoInvoice} submit="Gerar boleto">
                                    <input type="hidden" name="id" value={inv.id} />
                                    <p className="text-sm text-ink-500">O boleto de {fmtMoney(inv.amountCents)} com vencimento em {fmtDate(inv.dueDate)} será registrado no banco integrado, em nome de {inv.client.name}. A fatura passa a mostrar o boleto e o Pix do banco, com baixa automática.</p>
                                    {!inv.client.document && <p className="text-sm font-semibold text-red-600">Este cadastro está sem CPF/CNPJ. Preencha em Clientes e parceiros antes de gerar o boleto.</p>}
                                  </ActionForm>
                                </Modal>
                              )}
                              {inv.bankChargeId && (
                                <Modal trigger={<RefreshCw size={15} />} triggerClass="btn-icon" titleAttr="Consultar pagamento no banco" title="Consultar pagamento no banco">
                                  <ActionForm action={syncInvoice} submit="Consultar agora"><input type="hidden" name="id" value={inv.id} /><p className="text-sm text-ink-500">Normalmente o banco avisa sozinho quando o boleto é pago. Use se quiser conferir agora.</p></ActionForm>
                                </Modal>
                              )}
                              {!inv.bankChargeId && (
                                <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar fatura" title={`Editar fatura ${inv.number}`} wide>
                                  <ActionForm action={updateInvoice}>
                                    <input type="hidden" name="id" value={inv.id} />
                                    <Field label="Vencimento"><input type="date" name="dueDate" required defaultValue={inv.dueDate} className="input" /></Field>
                                    <InvoiceItems initial={invoiceItems(inv)} services={services} />
                                    <Field label="Observações"><textarea name="notes" rows={2} defaultValue={inv.notes} className="input" /></Field>
                                  </ActionForm>
                                </Modal>
                              )}
                              <Confirm trigger={<Ban size={15} />} titleAttr="Cancelar fatura" title={`Cancelar a fatura ${inv.number}?`} confirmLabel="Sim, cancelar" action={cancelInvoice} fields={{ id: inv.id }}
                                text={inv.bankChargeId ? 'A fatura e o boleto no banco serão cancelados. O link deixará de aceitar pagamento.' : 'A fatura deixa de contar como valor a receber. O link mostrará que ela foi cancelada.'} />
                            </>
                          )}
                          {inv.status === 'cancelada' && (
                            <Confirm trigger={<><RotateCcw size={15} /> Reativar</>} triggerClass="btn-ghost !px-2.5 !py-1.5" titleAttr="Reativar fatura" title={`Reativar a fatura ${inv.number}?`} confirmLabel="Sim, reativar" action={reactivateInvoice} fields={{ id: inv.id }}
                              text="A fatura sai do arquivo morto e volta a ficar em aberto, com o mesmo número, valor e Pix. Se tinha boleto, emita um novo." />
                          )}
                          {inv.status === 'paga' && (
                            <Confirm trigger={<Undo2 size={15} />} titleAttr="Desfazer pagamento" title="Desfazer o pagamento?" confirmLabel="Sim, desfazer" action={reopenInvoice} fields={{ id: inv.id }}
                              text="A fatura volta a ficar em aberto. Use quando um pagamento foi registrado por engano." />
                          )}
                          {inv.boletoUrl && <a href={inv.boletoUrl} target="_blank" rel="noreferrer" className="btn-icon" title="Boleto no banco" aria-label="Boleto no banco"><ExternalLink size={15} /></a>}
                        </div>
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
