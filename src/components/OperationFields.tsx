'use client';

import { useState } from 'react';
import { Field, SelectAll } from './ui';

export type ScreenOpt = { id: string; name: string; place: string };

/** Nome da operacao e os pontos (telas cadastradas em Minhas telas) que ela contempla. */
export function OperationFields({ screens, op }: { screens: ScreenOpt[]; op?: { id: string; name: string; description: string; screenIds: string[] } }) {
  const [sel, setSel] = useState<string[]>(op?.screenIds ?? []);
  const [q, setQ] = useState('');
  const shown = screens.filter((s) => `${s.name} ${s.place}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <>
      {op && <input type="hidden" name="id" value={op.id} />}
      {sel.map((id) => <input key={id} type="hidden" name="screenIds" value={id} />)}
      <Field label="Nome da operação"><input name="name" required maxLength={80} defaultValue={op?.name} className="input" placeholder="Ex.: Rede Delta, Academias Uberaba" /></Field>
      <Field label="Descrição (opcional)"><input name="description" maxLength={500} defaultValue={op?.description} className="input" /></Field>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="label">Pontos parceiros desta operação ({sel.length} de {screens.length})</span>
          <SelectAll total={shown.length} selected={shown.filter((x) => sel.includes(x.id)).length} onChange={(on) => setSel(on ? [...new Set([...sel, ...shown.map((x) => x.id)])] : sel.filter((id) => !shown.some((x) => x.id === id)))} label={q ? 'Marcar todos os encontrados' : 'Marcar todos'} />
        </div>
        {screens.length > 6 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ponto..." aria-label="Buscar ponto" className="input mb-2" />}
        {screens.length === 0 ? <p className="text-sm text-ink-400">Nenhuma tela cadastrada. Cadastre os pontos em Minhas telas.</p> : (
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-2 dark:border-ink-700">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink-50 dark:hover:bg-ink-800">
                  <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 accent-violet-600" />
                  <span className="text-sm font-medium">{s.name}</span>{s.place && <span className="text-xs text-ink-400">{s.place}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
