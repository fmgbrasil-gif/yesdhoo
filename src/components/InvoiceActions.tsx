import Link from 'next/link';
import type { Invoice } from '@prisma/client';
import { Ban, Banknote, CheckCircle2, ExternalLink, FileText, Pencil, RefreshCw, Repeat, RotateCcw, Undo2 } from 'lucide-react';
import { fmtDate, fmtMoney } from '@/lib/money';
import { invoiceItems, invoiceLink, METHODS } from '@/lib/billing';
import { suggestedAccount } from '@/lib/cash';
import { ActionForm, Confirm, Field, Modal } from './ui';
import { InvoiceItems, type ServiceOpt } from './InvoiceItems';
import { OperationAccountFields, type AccountOpt, type OpOpt } from './ChargeForm';
import { opDescription } from '@/lib/op-text';
import { MoneyInput } from './MoneyInput';
import { PixButton } from './PixPanel';
import { boletoInvoice, cancelCharge, cancelInvoice, payInvoice, reactivateInvoice, reopenInvoice, syncInvoice, updateInvoice } from '@/app/(painel)/financeiro/actions';

export type InvoiceRow = Invoice & {
  client: { name: string; document: string | null };
  operation?: { accountId: string | null } | null;
  subscription?: { status: string } | null;
};

/** Todos os botoes de uma fatura (Financeiro e Contas a receber). */
export function InvoiceActions({ inv, today, accounts, operations = [], services, hasBank }: { inv: InvoiceRow; today: string; accounts: AccountOpt[]; operations?: OpOpt[]; services: ServiceOpt[]; hasBank: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
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
                {accounts.length > 0 && <Field label="Entrou na conta" className="sm:col-span-3"><select name="accountId" className="input" defaultValue={suggestedAccount(inv, accounts)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
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
                  <OperationAccountFields operations={operations} accounts={accounts} operationId={inv.operationId} accountId={inv.accountId} />
                <Field label="Vencimento"><input type="date" name="dueDate" required defaultValue={inv.dueDate} className="input" /></Field>
                <InvoiceItems initial={invoiceItems(inv)} services={services} extraSuggestions={operations.map((o) => opDescription(o.name))} />
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
      {inv.subscriptionId && inv.subscription?.status === 'ativa' && (
        <Modal trigger={<Repeat size={15} />} triggerClass="btn-icon !text-red-600" titleAttr="Cancelar recorrência" title="Cancelar a recorrência?">
          <ActionForm action={cancelCharge} submit="Cancelar recorrência" submitClass="btn-danger" cancel>
            <input type="hidden" name="id" value={inv.subscriptionId} />
            <p className="text-sm text-ink-500">A cobrança recorrente de <b>{inv.client.name}</b> é encerrada e <b>todas as faturas futuras em aberto</b> dela são canceladas (vão para o arquivo morto). Faturas pagas e vencidas continuam no financeiro.</p>
            <Field label="Motivo (opcional)"><input name="reason" className="input" placeholder="Ex.: cliente desistiu" /></Field>
          </ActionForm>
        </Modal>
      )}
    </div>
  );
}
