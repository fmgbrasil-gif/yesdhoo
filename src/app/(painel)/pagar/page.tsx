import Link from 'next/link';
import { Ban, CheckCircle2, Pencil, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db, like } from '@/lib/db';
import { fmtDate, fmtMoney } from '@/lib/money';
import { localDate } from '@/lib/util';
import { PAYABLE_CATEGORIES } from '@/lib/cash';
import { Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';
import { cancelPayable, payPayable, savePayable, unpayPayable } from './actions';

export const metadata = { title: 'Contas a pagar' };

type P = { id: string; description: string; supplier: string | null; category: string; amountCents: number; dueDate: string; notes: string };

function PayableFields({ p, today, suppliers }: { p?: P; today: string; suppliers: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Descrição" className="sm:col-span-2"><input name="description" required maxLength={200} defaultValue={p?.description} className="input" placeholder="Ex.: Aluguel da sala, Internet, Comissão ponto X" /></Field>
      <Field label="Fornecedor / favorecido"><input name="supplier" list="fornecedores" maxLength={120} defaultValue={p?.supplier ?? ''} className="input" /></Field>
      <Field label="Categoria"><input name="category" list="categorias-pagar" required defaultValue={p?.category ?? ''} className="input" /></Field>
      <Field label="Valor"><MoneyInput name="amount" defaultCents={p?.amountCents} required /></Field>
      <Field label="Vencimento"><input type="date" name="dueDate" required defaultValue={p?.dueDate ?? today} className="input" /></Field>
      {!p && <Field label="Repetir" hint="Lança a mesma conta nos meses seguintes"><select name="repeat" className="input" defaultValue="1"><option value="1">Não repetir</option>{[2, 3, 6, 12, 24, 36].map((n) => <option key={n} value={n}>Por {n} meses</option>)}</select></Field>}
      <Field label="Observações" className="sm:col-span-2"><textarea name="notes" rows={2} maxLength={1000} defaultValue={p?.notes} className="input" /></Field>
      <datalist id="categorias-pagar">{PAYABLE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="fornecedores">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

export default async function PagarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const tid = user.tenantId;
  const today = localDate();
  const month = today.slice(0, 7);
  const in7 = new Date(`${today}T12:00:00`); in7.setDate(in7.getDate() + 7);
  const week = in7.toISOString().slice(0, 10);
  const f = ['avencer', 'vencidas', 'pagas', 'canceladas'].includes(sp.situacao ?? '') ? sp.situacao! : '';
  const { page, size, skip, take } = pageParams(sp);
  const where = {
    tenantId: tid,
    ...(f === 'avencer' ? { status: 'aberta', dueDate: { gte: today } } : f === 'vencidas' ? { status: 'aberta', dueDate: { lt: today } } : f === 'pagas' ? { status: 'paga' } : f === 'canceladas' ? { status: 'cancelada' } : { status: { not: 'cancelada' } }),
    ...(sp.q ? { OR: [{ description: like(sp.q) }, { supplier: like(sp.q) }, { category: like(sp.q) }] } : {}),
    ...(sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? { dueDate: { gte: `${sp.mes}-01`, lte: `${sp.mes}-31` } } : {}),
  };
  const sum = (w: object) => db.payable.aggregate({ where: { tenantId: tid, ...w }, _sum: { amountCents: true, paidCents: true }, _count: true });
  const [rows, total, late, next7, monthOpen, paidMonth, accounts, sup] = await Promise.all([
    db.payable.findMany({ where, orderBy: [{ dueDate: f === 'pagas' ? 'desc' : 'asc' }], skip, take, include: { account: { select: { name: true } } } }),
    db.payable.count({ where }),
    sum({ status: 'aberta', dueDate: { lt: today } }),
    sum({ status: 'aberta', dueDate: { gte: today, lte: week } }),
    sum({ status: 'aberta', dueDate: { gte: `${month}-01`, lte: `${month}-31` } }),
    sum({ status: 'paga', paidAt: { gte: `${month}-01`, lte: `${month}-31` } }),
    db.bankAccount.findMany({ where: { tenantId: tid, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    db.payable.findMany({ where: { tenantId: tid, supplier: { not: null } }, distinct: ['supplier'], select: { supplier: true }, take: 200 }),
  ]);
  const suppliers = sup.map((s) => s.supplier!).sort();
  const filters: [string, string][] = [['', 'Todas'], ['avencer', 'A vencer'], ['vencidas', 'Vencidas'], ['pagas', 'Pagas'], ['canceladas', 'Canceladas']];
  const kpi = (label: string, v: { _sum: { amountCents: number | null; paidCents: number | null }; _count: number }, color: string, hint: string, paid = false) => (
    <div className="card p-4"><p className={`label ${color}`}>{label}</p><p className={`text-2xl font-black tabular-nums ${color}`}>{fmtMoney((paid ? v._sum.paidCents : v._sum.amountCents) ?? 0)}</p><p className="text-xs text-ink-400">{v._count} conta(s) · {hint}</p></div>
  );

  return (
    <>
      <PageHeader title="Contas a pagar" crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Contas a pagar' }]}>
        <Link href="/caixa" className="btn-ghost">Caixa e contas</Link>
        <Modal trigger={<><Plus size={16} /> Nova conta a pagar</>} title="Nova conta a pagar" wide><ActionForm action={savePayable}><PayableFields today={today} suppliers={suppliers} /></ActionForm></Modal>
      </PageHeader>
      {accounts.length === 0 && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Para registrar pagamentos, cadastre antes o caixa e as contas bancárias em <Link href="/caixa" className="font-semibold underline">Caixa e contas</Link>.</p>}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpi('Vencidas', late, 'text-red-600', 'em atraso')}
        {kpi('Próximos 7 dias', next7, 'text-amber-600', 'a vencer')}
        {kpi('A pagar no mês', monthOpen, '', 'em aberto neste mês')}
        {kpi('Pago no mês', paidMonth, 'text-emerald-600', 'já pagas', true)}
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700">
          {filters.map(([k, l]) => <Link key={k} href={k ? `/pagar?situacao=${k}` : '/pagar'} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${f === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{l}</Link>)}
        </div>
        <form className="flex flex-wrap gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {f && <input type="hidden" name="situacao" value={f} />}
          <input name="q" defaultValue={sp.q} placeholder="Descrição, fornecedor ou categoria..." aria-label="Buscar" className="input w-72" />
          <input type="month" name="mes" defaultValue={sp.mes} aria-label="Mês do vencimento" className="input w-44" />
          <button className="btn-ghost">Filtrar</button>
        </form>
        {rows.length === 0 ? <Empty title="Nenhuma conta a pagar" text="Lance aluguel, internet, comissões e outras despesas para controlar o que vence e o que já foi pago." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th className="th">Vencimento</th><th className="th">Descrição</th><th className="th">Categoria</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th text-right">Ações</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const overdue = p.status === 'aberta' && p.dueDate < today;
                  return (
                    <tr key={p.id} className={`border-t border-ink-100 dark:border-ink-700 ${p.status === 'cancelada' ? 'opacity-60' : ''}`}>
                      <td className={`td whitespace-nowrap ${overdue ? 'font-semibold text-red-600' : ''}`}>{fmtDate(p.dueDate)}</td>
                      <td className="td"><span className="font-medium">{p.description}</span>{p.installments && <span className="ml-1 text-xs text-ink-400">({p.installment}/{p.installments})</span>}<span className="block text-xs text-ink-400">{p.supplier}</span></td>
                      <td className="td text-ink-500">{p.category}</td>
                      <td className="td text-right font-semibold tabular-nums">{fmtMoney(p.amountCents)}</td>
                      <td className="td">
                        <span className={`badge ${p.status === 'paga' ? 'bg-emerald-100 text-emerald-700' : p.status === 'cancelada' ? 'bg-ink-100 text-ink-500' : overdue ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}`}>{p.status === 'paga' ? 'Paga' : p.status === 'cancelada' ? 'Cancelada' : overdue ? 'Vencida' : 'A vencer'}</span>
                        {p.status === 'paga' && <span className="block text-xs text-ink-400">{fmtDate(p.paidAt)} · {fmtMoney(p.paidCents)}{p.account ? ` · ${p.account.name}` : ''}</span>}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {p.status === 'aberta' && <>
                            <Modal trigger={<CheckCircle2 size={15} />} triggerClass="btn-icon !text-emerald-600" titleAttr="Pagar" title={`Pagar — ${p.description}`}>
                              <ActionForm action={payPayable} submit="Confirmar pagamento">
                                <input type="hidden" name="id" value={p.id} />
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <Field label="Valor pago"><MoneyInput name="paid" defaultCents={p.amountCents} /></Field>
                                  <Field label="Data"><input type="date" name="paidAt" defaultValue={today} className="input" /></Field>
                                  <Field label="Sai da conta"><select name="accountId" required className="input" defaultValue={accounts[0]?.id ?? ''}>{accounts.length === 0 && <option value="">Cadastre uma conta</option>}{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
                                </div>
                              </ActionForm>
                            </Modal>
                            <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title="Editar conta a pagar" wide><ActionForm action={savePayable}><PayableFields p={p} today={today} suppliers={suppliers} /></ActionForm></Modal>
                            <Modal trigger={<Ban size={15} />} triggerClass="btn-icon" titleAttr="Cancelar" title={`Cancelar — ${p.description}?`}>
                              <ActionForm action={cancelPayable} submit="Sim, cancelar" submitClass="btn-primary !bg-red-600">
                                <input type="hidden" name="id" value={p.id} />
                                <p className="text-sm text-ink-500">A conta deixa de contar como valor a pagar.</p>
                                {p.groupId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="series" className="h-4 w-4" /> Cancelar também as próximas desta série mensal</label>}
                              </ActionForm>
                            </Modal>
                          </>}
                          {p.status === 'paga' && <Confirm trigger={<Undo2 size={15} />} titleAttr="Estornar pagamento" title="Estornar o pagamento?" text="A conta volta a ficar em aberto e o valor volta para o saldo da conta corrente." confirmLabel="Sim, estornar" action={unpayPayable} fields={{ id: p.id }} />}
                          {p.status === 'cancelada' && <Confirm trigger={<RotateCcw size={15} />} titleAttr="Reativar" title="Reativar esta conta?" text="Ela volta a ficar em aberto." confirmLabel="Sim, reativar" action={cancelPayable} fields={{ id: p.id, reactivate: '1' }} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} size={size} total={total} params={sp} base="/pagar" />
      </div>
    </>
  );
}
