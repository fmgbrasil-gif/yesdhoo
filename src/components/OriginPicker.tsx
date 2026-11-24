'use client';

import { useState } from 'react';

type Opt = { id: string; name: string; kind: string };

/** Escolha de quem e o conteudo: cliente anunciante, parceiro (local da tela) ou institucional. */
export function OriginPicker({ clients, defaultClientId }: { clients: Opt[]; defaultClientId?: string | null }) {
  const current = clients.find((c) => c.id === defaultClientId);
  const [origin, setOrigin] = useState<'cliente' | 'parceiro' | 'cortesia' | 'institucional'>(current ? (current.kind === 'parceiro' || current.kind === 'cortesia' ? current.kind : 'cliente') : defaultClientId === undefined ? 'cliente' : 'institucional');
  const list = clients.filter((c) => c.kind === origin);
  const labels = { cliente: 'Cliente', parceiro: 'Parceiro', cortesia: 'Cortesia', institucional: 'Institucional' } as const;
  return (
    <div className="col-span-2 space-y-2">
      <span className="label">De quem é este conteúdo</span>
      <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900" role="radiogroup" aria-label="Origem do conteúdo">
        {(['cliente', 'parceiro', 'cortesia', 'institucional'] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={origin === o} onClick={() => setOrigin(o)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${origin === o ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500 dark:text-ink-300'}`}>{labels[o]}</button>
        ))}
      </div>
      {origin === 'institucional' ? (
        <>
          <input type="hidden" name="clientId" value="" />
          <p className="text-xs text-ink-400">Conteúdo da própria rede (chamadas, avisos, “anuncie aqui”), sem cliente ou parceiro.</p>
        </>
      ) : list.length === 0 ? (
        <>
          <input type="hidden" name="clientId" value="" />
          <p className="text-xs text-ink-400">Nenhum(a) {labels[origin].toLowerCase()} cadastrado(a). Cadastre em “Clientes e parceiros”; por enquanto o conteúdo fica como institucional.</p>
        </>
      ) : (
        <select name="clientId" required defaultValue={current && current.kind === origin ? current.id : ''} className="input" aria-label={labels[origin]}>
          <option value="" disabled>Selecione...</option>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
    </div>
  );
}
