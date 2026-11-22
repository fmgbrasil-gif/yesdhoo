import Link from 'next/link';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark, Pencil, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDate, fmtMoney } from '@/lib/money';
import { localDate } from '@/lib/util';
import { ACCOUNT_KINDS, balances } from '@/lib/cash';
import { optionsFor } from '@/lib/options';
import { OptionInput } from '@/components/OptionInput';
import { Empty, PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';
import { deleteAccount, deleteEntry, saveAccount, saveEntry, transfer } from './actions';

export const metadata = { title: 'Caixa e contas' };

type Acc = { id: string; name: string; kind: string; bank: string | null; initialCents: number; isDefault: boolean; active: boolean };

function AccountFields({ a }: { a?: Acc }) {
  return (
    <>
      {a && <input type="hidden" name="id" value={a.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da conta"><input name="name" required maxLength={60} defaultValue={a?.name} className="input" placeholder="Ex.: Sicoob, Caixa da loja" /></Field>
        <Field label="Tipo"><select name="kind" defaultValue={a?.kind ?? 'banco'} className="input">{Object.entries(ACCOUNT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Banco, agência e conta (opcional)" className="sm:col-span-2"><input name="bank" maxLength={120} defaultValue={a?.bank ?? ''} className="input" /></Field>
        <Field label="Saldo inicial" hint="Saldo da conta no dia em que começou a usar o sistema"><MoneyInput name="initial" defaultCents={a?.initialCents ?? 0} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={a?.isDefault} className="h-4 w-4 accent-violet-600" /> Conta padrão (recebe os pagamentos de boleto e Pix baixados automaticamente)</label>
      {a && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" defaultChecked={!a.active} className="h-4 w-4 accent-violet-600" /> Conta desativada (sai das listas, mantém o histórico)</label>}
    </>
  );
}

export default async function CaixaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const tid = user.tenantId;
  const today = localDate();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? '') ? sp.de! : `${today.slice(0, 7)}-01`;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? '') ? sp.ate! : today;
  const [accounts, descOpts, catOpts] = await Promise.all([balances(tid), optionsFor(tid, 'lancamento'), optionsFor(tid, 'categoria')]);
  const active = accounts.filter((a) => a.active);
  const conta = accounts.find((a) => a.id === sp.conta) ?? null;
  const where = { tenantId: tid, date: { gte: de, lte: ate }, ...(conta ? { accountId: conta.id } : {}) };
  const [entries, sums] = await Promise.all([
    db.cashEntry.findMany({ where, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], include: { account: { select: { name: true } } }, take: 1000 }),
    // com todas as contas, transferencias entre contas proprias nao contam como entrada/saida
    db.cashEntry.groupBy({ by: ['kind'], where: conta ? where : { ...where, transferId: null }, _sum: { amountCents: true } }),
  ]);
  const inP = sums.find((s) => s.kind === 'entrada')?._sum.amountCents ?? 0;
  const outP = sums.find((s) => s.kind === 'saida')?._sum.amountCents ?? 0;
  const total = active.reduce((a, x) => a + x.balanceCents, 0);
  // saldo antes do periodo (para o saldo linha a linha de uma conta)
  const prev = new Date(`${de}T12:00:00`); prev.setDate(prev.getDate() - 1);
  let running = conta ? (await balances(tid, prev.toISOString().slice(0, 10))).find((a) => a.id === conta.id)!.balanceCents : 0;
  const accountSelect = (name: string, label: string) => (
    <Field label={label}><select name={name} required className="input" defaultValue={active.find((a) => a.isDefault)?.id ?? ''}><option value="" disabled>Selecione...</option>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
  );
  const q = (extra: Record<string, string>) => `/caixa?${new URLSearchParams({ de, ate, ...(conta ? { conta: conta.id } : {}), ...extra })}`;

  return (
    <>
      <PageHeader title="Caixa e contas" crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Caixa e contas' }]}>
        <Modal trigger={<><Plus size={16} /> Nova conta</>} triggerClass="btn-ghost" title="Nova conta corrente"><ActionForm action={saveAccount}><AccountFields /></ActionForm></Modal>
        {active.length > 0 && <>
          <Modal trigger={<><ArrowLeftRight size={16} /> Transferência</>} triggerClass="btn-ghost" title="Transferência entre contas">
            <ActionForm action={transfer} submit="Transferir">
              <div className="grid gap-3 sm:grid-cols-2">{accountSelect('from', 'Sai da conta')}{accountSelect('to', 'Entra na conta')}
                <Field label="Valor"><MoneyInput name="amount" required /></Field><Field label="Data"><input type="date" name="date" defaultValue={today} className="input" /></Field>
                <Field label="Observação (opcional)" className="sm:col-span-2"><input name="description" maxLength={120} className="input" /></Field></div>
            </ActionForm>
          </Modal>
          <Modal trigger={<><Plus size={16} /> Lançamento</>} title="Novo lançamento">
            <ActionForm action={saveEntry} submit="Lançar">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo"><select name="kind" className="input"><option value="entrada">Entrada (dinheiro que entra)</option><option value="saida">Saída (dinheiro que sai)</option></select></Field>
                {accountSelect('accountId', 'Conta')}
                <Field label="Descrição" className="sm:col-span-2" group><OptionInput name="description" kind="lancamento" label="Descrição" options={descOpts} required /></Field>
                <Field label="Categoria" group><OptionInput name="category" kind="categoria" label="Categoria" options={catOpts} /></Field>
                <Field label="Valor"><MoneyInput name="amount" required /></Field>
                <Field label="Data"><input type="date" name="date" defaultValue={today} className="input" /></Field>
              </div>
            </ActionForm>
          </Modal>
        </>}
      </PageHeader>

      {accounts.length === 0 ? (
        <div className="card"><Empty title="Nenhuma conta cadastrada" text="Cadastre o caixa e as contas bancárias da empresa, com o saldo de hoje. A partir daí, recebimentos de faturas e pagamentos de contas entram no extrato sozinhos." /></div>
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <div className="card p-4"><p className="label">Saldo total hoje</p><p className={`text-2xl font-black tabular-nums ${total < 0 ? 'text-red-600' : ''}`}>{fmtMoney(total)}</p><p className="text-xs text-ink-400">{active.length} conta(s) ativa(s)</p></div>
            <div className="card p-4"><p className="label text-emerald-600">Entradas no período</p><p className="text-2xl font-black tabular-nums text-emerald-600">{fmtMoney(inP)}</p><p className="text-xs text-ink-400">{fmtDate(de)} a {fmtDate(ate)}</p></div>
            <div className="card p-4"><p className="label text-red-600">Saídas no período</p><p className="text-2xl font-black tabular-nums text-red-600">{fmtMoney(outP)}</p><p className="text-xs text-ink-400">Resultado: <b className={inP - outP < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtMoney(inP - outP)}</b></p></div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {accounts.map((a) => (
              <div key={a.id} className={`card p-4 ${a.active ? '' : 'opacity-50'} ${conta?.id === a.id ? 'ring-2 ring-brand-400' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={conta?.id === a.id ? q({ conta: '' }) : q({ conta: a.id })} className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-semibold">{a.kind === 'caixa' ? <Wallet size={15} /> : <Landmark size={15} />} {a.name}{a.isDefault && <Star size={13} className="fill-amber-400 text-amber-400" aria-label="Conta padrão" />}</p>
                    <p className="truncate text-xs text-ink-400">{ACCOUNT_KINDS[a.kind]}{a.bank ? ` · ${a.bank}` : ''}{a.active ? '' : ' · desativada'}</p>
                  </Link>
                  <div className="flex shrink-0">
                    <Modal trigger={<Pencil size={14} />} triggerClass="btn-icon" titleAttr="Editar conta" title={`Editar ${a.name}`}><ActionForm action={saveAccount}><AccountFields a={a} /></ActionForm></Modal>
                    <Confirm trigger={<Trash2 size={14} />} titleAttr="Excluir conta" title={`Excluir ${a.name}?`} text="Só contas sem lançamentos podem ser excluídas." action={deleteAccount} fields={{ id: a.id }} />
                  </div>
                </div>
                <p className={`mt-2 text-xl font-black tabular-nums ${a.balanceCents < 0 ? 'text-red-600' : ''}`}>{fmtMoney(a.balanceCents)}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <form className="flex flex-wrap items-end gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
              <Field label="Conta"><select name="conta" defaultValue={conta?.id ?? ''} className="input"><option value="">Todas as contas</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="De"><input type="date" name="de" defaultValue={de} className="input" /></Field>
              <Field label="Até"><input type="date" name="ate" defaultValue={ate} className="input" /></Field>
              <button className="btn-ghost">Filtrar</button>
            </form>
            {entries.length === 0 ? <Empty title="Nenhum lançamento no período" text="Recebimentos de faturas, contas pagas e lançamentos manuais aparecem aqui." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left"><th className="th">Data</th><th className="th">Descrição</th><th className="th">Conta</th><th className="th text-right">Entrada</th><th className="th text-right">Saída</th>{conta && <th className="th text-right">Saldo</th>}<th className="th" /></tr></thead>
                  <tbody>
                    {entries.map((e) => {
                      running += e.kind === 'entrada' ? e.amountCents : -e.amountCents;
                      const origin = e.invoiceId ? 'Fatura' : e.payableId ? 'Conta a pagar' : e.transferId ? 'Transferência' : null;
                      return (
                        <tr key={e.id} className="border-t border-ink-100 dark:border-ink-700">
                          <td className="td whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="td"><span className="font-medium">{e.description}</span><span className="block text-xs text-ink-400">{[e.category, origin && origin !== e.category ? origin : null].filter(Boolean).join(' · ')}</span></td>
                          <td className="td whitespace-nowrap text-ink-500">{e.account.name}</td>
                          <td className="td text-right tabular-nums text-emerald-600">{e.kind === 'entrada' ? <span className="inline-flex items-center gap-1"><ArrowDownLeft size={13} />{fmtMoney(e.amountCents)}</span> : ''}</td>
                          <td className="td text-right tabular-nums text-red-600">{e.kind === 'saida' ? <span className="inline-flex items-center gap-1"><ArrowUpRight size={13} />{fmtMoney(e.amountCents)}</span> : ''}</td>
                          {conta && <td className={`td text-right font-semibold tabular-nums ${running < 0 ? 'text-red-600' : ''}`}>{fmtMoney(running)}</td>}
                          <td className="td text-right">{!e.invoiceId && !e.payableId && <Confirm trigger={<Trash2 size={14} />} titleAttr="Excluir lançamento" title="Excluir este lançamento?" text={e.transferId ? 'As duas pontas da transferência serão excluídas.' : 'O valor sai do extrato e do saldo da conta.'} action={deleteEntry} fields={{ id: e.id }} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
