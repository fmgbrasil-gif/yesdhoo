import Link from 'next/link';
import { Ban, Banknote, CalendarRange, CheckCircle2, ExternalLink, FileText, Plus, RefreshCw, Search, Settings, Undo2 } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db, like } from '@/lib/db';
import { localDate } from '@/lib/util';
import { fmtDate, fmtMoney } from '@/lib/money';
import { bankOf, invoiceLink, invoiceState, METHODS, STATE_LABEL } from '@/lib/billing';
import { Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { InvoiceItems } from '@/components/InvoiceItems';
import { boletoInvoice, cancelInvoice, changeDueDate, generateMonth, payInvoice, reopenInvoice, saveInvoice, syncInvoice } from './actions';

const BADGE: Record<string, string> = {
  aberta: 'bg-sky-100 text-sky-700', vencida: 'bg-red-100 text-red-700', paga: 'bg-emerald-100 text-emerald-700', cancelada: 'bg-ink-100 text-ink-500',
};

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const tid = user.tenantId;
  const today = localDate();
  const month = today.slice(0, 7);
  const { page, size, skip, take } = pageParams(sp);
  const status = sp.situacao;
  const where = {
    tenantId: tid,
    ...(status === 'vencida' ? { status: 'aberta', dueDate: { lt: today } } : status === 'aberta' ? { status: 'aberta', dueDate: { gte: today } } : status === 'paga' || status === 'cancelada' ? { status } : {}),
    ...(sp.cliente ? { client: { name: like(sp.cliente) } } : {}),
    ...(sp.de ? { dueDate: { gte: sp.de, ...(sp.ate ? { lte: sp.ate } : {}) } } : sp.ate ? { dueDate: { lte: sp.ate } } : {}),
  };
  const sum = (w: object) => db.invoice.aggregate({ where: { tenantId: tid, ...w }, _sum: { amountCents: true }, _count: true });
  const [rows, total, open, overdue, paidMonth, clients] = await Promise.all([
    db.invoice.findMany({ where, skip, take, orderBy: [{ dueDate: 'desc' }, { number: 'desc' }], include: { client: { select: { name: true, kind: true, document: true } } } }),
    db.invoice.count({ where }),
    sum({ status: 'aberta', dueDate: { gte: today } }),
    sum({ status: 'aberta', dueDate: { lt: today } }),
    db.invoice.aggregate({ where: { tenantId: tid, status: 'paga', paidAt: { gte: new Date(`${month}-01T00:00:00-03:00`) } }, _sum: { paidCents: true }, _count: true }),
    db.client.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
  ]);
  const hasBank = !!bankOf(user.tenant);
  const noPix = !user.tenant.pixKey && !hasBank;
  const filters = [['', 'Todas'], ['aberta', 'Em aberto'], ['vencida', 'Vencidas'], ['paga', 'Pagas'], ['cancelada', 'Canceladas']];

  return (
    <>
      <PageHeader title="Financeiro" crumbs={[{ label: 'Financeiro' }, { label: 'Contas a receber' }]}>
        <Link href="/empresa#cobranca" className="btn-ghost"><Settings size={15} /> Pix e banco</Link>
        <Modal trigger={<><CalendarRange size={16} /> Gerar mensalidades</>} triggerClass="btn-ghost" title="Gerar faturas de mensalidade">
          <ActionForm action={generateMonth} submit="Gerar faturas">
            <p className="text-sm text-ink-500">Cria uma fatura para cada cliente ou parceiro com mensalidade preenchida no cadastro, com vencimento no dia escolhido para cada um. Quem já tem fatura do mês é pulado.</p>
            <Field label="Mês de referência"><input type="month" name="month" required defaultValue={month} className="input" /></Field>
          </ActionForm>
        </Modal>
        <Modal trigger={<><Plus size={16} /> Nova fatura</>} title="Nova fatura" wide>
          <ActionForm action={saveInvoice} submit="Criar fatura">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente ou parceiro">
                <select name="clientId" required className="input" defaultValue="">
                  <option value="" disabled>Selecione...</option>
                  {['cliente', 'parceiro'].map((k) => (
                    <optgroup key={k} label={k === 'cliente' ? 'Clientes' : 'Parceiros'}>
                      {clients.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Vencimento"><input type="date" name="dueDate" required className="input" defaultValue={localDate('America/Sao_Paulo', new Date(Date.now() + 7 * 86400_000))} /></Field>
            </div>
            <InvoiceItems />
            <Field label="Observações (aparecem na fatura)"><textarea name="notes" rows={2} className="input" /></Field>
          </ActionForm>
        </Modal>
      </PageHeader>

      {noPix && <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-800 dark:text-ink-200">Cadastre sua chave Pix em <Link href="/empresa#cobranca" className="font-semibold underline">Minha empresa</Link> para que as faturas saiam com QR Code de pagamento.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-ink-400">A receber</p><p className="text-2xl font-black tabular-nums">{fmtMoney(open._sum.amountCents)}</p><p className="text-xs text-ink-400">{open._count} fatura(s) no prazo</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-red-600">Vencido</p><p className="text-2xl font-black tabular-nums text-red-600">{fmtMoney(overdue._sum.amountCents)}</p><p className="text-xs text-ink-400">{overdue._count} fatura(s) em atraso</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-emerald-600">Recebido no mês</p><p className="text-2xl font-black tabular-nums text-emerald-600">{fmtMoney(paidMonth._sum.paidCents)}</p><p className="text-xs text-ink-400">{paidMonth._count} pagamento(s)</p></div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700">
          {filters.map(([k, label]) => (
            <Link key={k} href={k ? `/financeiro?situacao=${k}` : '/financeiro'} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${(status ?? '') === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label}</Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {status && <input type="hidden" name="situacao" value={status} />}
          <input name="cliente" defaultValue={sp.cliente} placeholder="Cliente ou parceiro..." className="input w-56" aria-label="Cliente ou parceiro" />
          <label className="text-xs text-ink-400">Vencimento de<input type="date" name="de" defaultValue={sp.de} className="input" /></label>
          <label className="text-xs text-ink-400">até<input type="date" name="ate" defaultValue={sp.ate} className="input" /></label>
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
        </form>
        {rows.length === 0 ? <Empty title="Nenhuma fatura" text="Crie uma fatura avulsa ou gere as mensalidades do mês." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Nº</th><th className="th">Cliente</th><th className="th">Vencimento</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((inv) => {
                  const st = invoiceState(inv);
                  return (
                    <tr key={inv.id}>
                      <td className="td font-mono text-ink-500">{String(inv.number).padStart(5, '0')}</td>
                      <td className="td"><span className="block font-semibold">{inv.client.name}</span><span className="text-xs text-ink-400">{inv.client.kind === 'parceiro' ? 'Parceiro' : 'Cliente'}{inv.competence ? ` · mensalidade ${inv.competence.split('-').reverse().join('/')}` : ''}</span></td>
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
                              <Modal trigger={<CheckCircle2 size={15} />} triggerClass="btn-icon !text-emerald-600" titleAttr="Registrar pagamento" title={`Registrar pagamento — fatura ${inv.number}`}>
                                <ActionForm action={payInvoice} submit="Confirmar pagamento">
                                  <input type="hidden" name="id" value={inv.id} />
                                  <div className="grid gap-3 sm:grid-cols-3">
                                    <Field label="Valor recebido"><input name="paid" inputMode="decimal" defaultValue={(inv.amountCents / 100).toFixed(2).replace('.', ',')} className="input" /></Field>
                                    <Field label="Data"><input type="date" name="paidAt" defaultValue={today} className="input" /></Field>
                                    <Field label="Forma"><select name="method" className="input" defaultValue="pix">{Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
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
                                <Modal trigger={<CalendarRange size={15} />} triggerClass="btn-icon" titleAttr="Alterar vencimento" title="Alterar vencimento">
                                  <ActionForm action={changeDueDate}><input type="hidden" name="id" value={inv.id} /><Field label="Novo vencimento"><input type="date" name="dueDate" required defaultValue={inv.dueDate} className="input" /></Field></ActionForm>
                                </Modal>
                              )}
                              <Confirm trigger={<Ban size={15} />} titleAttr="Cancelar fatura" title={`Cancelar a fatura ${inv.number}?`} confirmLabel="Sim, cancelar" action={cancelInvoice} fields={{ id: inv.id }}
                                text={inv.bankChargeId ? 'A fatura e o boleto no banco serão cancelados. O link deixará de aceitar pagamento.' : 'A fatura deixa de contar como valor a receber. O link mostrará que ela foi cancelada.'} />
                            </>
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
      </div>
    </>
  );
}
