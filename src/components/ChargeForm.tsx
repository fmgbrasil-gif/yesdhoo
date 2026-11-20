'use client';

import { useState } from 'react';
import { Field } from './ui';
import { InvoiceItems } from './InvoiceItems';

type Opt = { id: string; name: string; kind: string };
const MODES = [
  { key: 'avulsa', label: 'Avulsa', hint: 'Uma fatura só, com a data de vencimento escolhida.' },
  { key: 'periodo', label: 'Por período', hint: 'Contrato com prazo: gera agora uma fatura para cada mês do período.' },
  { key: 'recorrente', label: 'Recorrente', hint: 'Todo mês, sem data para acabar: o sistema gera a fatura de cada mês sozinho até você cancelar.' },
] as const;

/** Campos da nova cobranca; o tipo escolhido mostra os campos de data certos. */
export function ChargeFields({ clients, today }: { clients: Opt[]; today: string }) {
  const [mode, setMode] = useState<(typeof MODES)[number]['key']>('recorrente');
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
        <Field label="Cliente ou parceiro" className="sm:col-span-3">
          <select name="clientId" required className="input" defaultValue="">
            <option value="" disabled>Selecione...</option>
            {['cliente', 'parceiro'].map((k) => (
              <optgroup key={k} label={k === 'cliente' ? 'Clientes' : 'Parceiros'}>
                {clients.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
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
      <InvoiceItems />
      <Field label="Observações (aparecem nas faturas)"><textarea name="notes" rows={2} className="input" /></Field>
    </>
  );
}
