import Link from 'next/link';
import { FileSignature, Plus, Settings, Zap } from 'lucide-react';
import type { Subscription } from '@prisma/client';
import { fmtMoney } from '@/lib/money';
import { SUB_MODE } from '@/lib/billing';
import { ActionForm, Field, Modal } from './ui';
import { ChargeFields, type AccountOpt, type OpOpt } from './ChargeForm';
import type { ServiceOpt } from './InvoiceItems';
import { generateContract, saveCharge } from '@/app/(painel)/financeiro/actions';

type Opt = { id: string; name: string; kind: string };

/** Botoes do topo do Financeiro (tambem em Contas a receber). */
export function FinanceButtons({ clients, subs: activeSubs, services, operations, accounts, today }: {
  clients: Opt[]; subs: (Subscription & { client: { name: string } })[]; services: ServiceOpt[]; operations: OpOpt[]; accounts: AccountOpt[]; today: string;
}) {
  return (
    <>
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
          <ChargeFields clients={clients} today={today} services={services} operations={operations} accounts={accounts} />
        </ActionForm>
      </Modal>
      <Link href="/financeiro/nova" className="btn-primary"><Plus size={16} /> Nova cobrança</Link>
    </>
  );
}
