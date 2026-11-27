'use client';

import { useState } from 'react';
import { Field } from './ui';
import { InvoiceItems, type ServiceOpt } from './InvoiceItems';
import { opDescription } from '@/lib/op-text';

type Opt = { id: string; name: string; kind: string };
const MODES = [
  { key: 'avulsa', label: 'Avulsa', hint: 'Uma fatura só, com a data de vencimento escolhida.' },
  { key: 'periodo', label: 'Por período', hint: 'Contrato com prazo: gera agora uma fatura para cada mês do período.' },
  { key: 'recorrente', label: 'Recorrente', hint: 'Todo mês, sem data para acabar: o sistema gera a fatura de cada mês sozinho até você cancelar.' },
] as const;

/** Campos da nova cobranca; o tipo escolhido mostra os campos de data certos. */
export type OpOpt = { id: string; name: string; accountId?: string | null };
export type AccountOpt = { id: string; name: string; isDefault?: boolean };

/** Operacao e caixa que recebe (no inicio da cobranca): ao escolher a operacao, o caixa dela vem marcado. */
export function OperationAccountFields({ operations = [], accounts = [], operationId, accountId, onOperation }: {
  operations?: OpOpt[]; accounts?: AccountOpt[]; operationId?: string | null; accountId?: string | null; onOperation?: (op: OpOpt | null) => void;
}) {
  const fallback = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '';
  const [op, setOp] = useState(operationId ?? '');
  const [acc, setAcc] = useState(accountId ?? operations.find((o) => o.id === operationId)?.accountId ?? fallback);
  if (!operations.length && !accounts.length) return null;
  return (
    <div className="grid gap-3 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-3 sm:col-span-3 sm:grid-cols-2 dark:border-ink-600 dark:bg-ink-900">
      {operations.length > 0 && (
        <Field label="Operação" hint="Os pontos da operação entram no contrato; a descrição é sugerida">
          <select name="operationId" value={op} className="input" onChange={(e) => {
            const o = operations.find((x) => x.id === e.target.value) ?? null;
            setOp(e.target.value);
            setAcc(o?.accountId && accounts.some((a) => a.id === o.accountId) ? o.accountId : fallback); // operacao sem caixa proprio: volta ao caixa padrao
            onOperation?.(o);
          }}>
            <option value="">Sem operação</option>
            {operations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      )}
      {accounts.length > 0 && (
        <Field label="Caixa que recebe" hint="Os pagamentos desta cobrança entram neste caixa">
          <select name="accountId" value={acc} onChange={(e) => setAcc(e.target.value)} className="input">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isDefault ? ' (padrão)' : ''}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

export function ChargeFields({ clients, today, services, fixedClient, operations, accounts, defaultOperationId }: { clients: Opt[]; today: string; services: ServiceOpt[]; fixedClient?: { id: string; name: string }; operations?: OpOpt[]; accounts?: AccountOpt[]; defaultOperationId?: string | null }) {
  const [mode, setMode] = useState<(typeof MODES)[number]['key']>('recorrente');
  const [suggest, setSuggest] = useState<string | undefined>(undefined);
  const month = today.slice(0, 7);
  return (
    <>
      <input type="hidden" name="mode" value={mode} />
      <div>
        <span className="label">Tipo de cobrança</span>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900" role="radiogroup" aria-label="Tipo de cobrança">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${mode === m.key ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500 dark:text-ink-300'}`}>{m.label}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-400">{MODES.find((m) => m.key === mode)!.hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <OperationAccountFields operations={operations} accounts={accounts} operationId={defaultOperationId} onOperation={(o) => setSuggest(o ? opDescription(o.name) : undefined)} />
        {fixedClient ? (
          <div className="sm:col-span-3"><input type="hidden" name="clientId" value={fixedClient.id} /><span className="label">Cliente</span><p className="font-semibold">{fixedClient.name}</p></div>
        ) : <Field label="Cliente ou parceiro" className="sm:col-span-3">
          <select name="clientId" required className="input" defaultValue="">
            <option value="" disabled>Selecione...</option>
            {['cliente', 'parceiro', 'cortesia'].map((k) => (
              <optgroup key={k} label={k === 'cliente' ? 'Clientes' : k === 'parceiro' ? 'Parceiros' : 'Cortesias'}>
                {clients.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>}
        {mode === 'avulsa' ? (
          <Field label="Vencimento"><input type="date" name="dueDate" required className="input" defaultValue={today} /></Field>
        ) : (
          <>
            <Field label="Primeira cobrança em"><input type="month" name="startMonth" required className="input" defaultValue={month} /></Field>
            <Field label="Dia do vencimento" hint="Entre 1 e 28"><input type="number" name="dueDay" min={1} max={28} required className="input" defaultValue={10} /></Field>
            {mode === 'periodo' && <Field label="Quantos meses"><input type="number" name="months" min={2} max={60} required className="input" defaultValue={6} /></Field>}
          </>
        )}
      </div>
      <p className="label -mb-1">{mode === 'avulsa' ? 'Itens da fatura' : 'Itens de cada mês'}</p>
      <InvoiceItems services={services} suggest={suggest} extraSuggestions={(operations ?? []).map((o) => opDescription(o.name))} />
      <Field label="Observações (aparecem nas faturas)"><textarea name="notes" rows={2} className="input" /></Field>
    </>
  );
}
