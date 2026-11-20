'use client';

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';

/** Campos do formulario preenchidos com o retorno da Receita (nome do campo no form -> chave do retorno). */
const DEFAULT_MAP: Record<string, string> = {
  name: 'name', tradeName: 'tradeName', road: 'road', number: 'number', complement: 'complement', neighborhood: 'neighborhood',
  city: 'city', state: 'state', zipcode: 'zipcode', phone1: 'phone', phone: 'phone', email: 'email',
};

/**
 * Campo de CPF/CNPJ com consulta na Receita: ao completar 14 digitos (ou ao clicar em Buscar),
 * preenche razao social, nome fantasia, endereco, telefone e e-mail do mesmo formulario.
 */
export function CnpjLookup({ name = 'document', defaultValue, className = 'input', map = DEFAULT_MAP }: { name?: string; defaultValue?: string | null; className?: string; map?: Record<string, string> }) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [state, setState] = useState<{ busy?: boolean; msg?: string; err?: boolean }>({});

  const fill = async (input: HTMLInputElement) => {
    const cnpj = input.value.replace(/\D/g, ''); // valor atual do campo (o estado ainda nao foi atualizado no onChange)
    if (cnpj.length !== 14) { setState({ msg: 'A consulta na Receita é feita pelo CNPJ (14 dígitos).', err: true }); return; }
    setState({ busy: true });
    try {
      const r = await fetch(`/api/cnpj/${cnpj}`);
      const d = await r.json();
      if (!r.ok) { setState({ msg: d.error, err: true }); return; }
      const form = input.form!;
      for (const [field, key] of Object.entries(map)) {
        const el = form.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement | null;
        const v = d[key];
        if (!el || !v || !('value' in el)) continue;
        if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === v)) continue;
        el.value = v;
      }
      setState({ msg: `Dados preenchidos pela Receita${d.status ? ` · situação: ${d.status}` : ''}. Confira antes de salvar.`, err: d.status && d.status !== 'ATIVA' });
    } catch {
      setState({ msg: 'Não foi possível consultar a Receita agora.', err: true });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input name={name} value={value} inputMode="numeric" className={className} placeholder="Só números"
          onChange={(e) => { const v = e.target.value; setValue(v); if (v.replace(/\D/g, '').length === 14 && value.replace(/\D/g, '').length !== 14) fill(e.target); }} />
        <button type="button" className="btn-ghost shrink-0" disabled={state.busy}
          onClick={(e) => fill((e.currentTarget.parentElement!.querySelector('input') as HTMLInputElement))}>
          {state.busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Receita
        </button>
      </div>
      {state.msg && <p className={`mt-1 text-xs ${state.err ? 'text-red-600' : 'text-emerald-600'}`} role="status">{state.msg}</p>}
    </div>
  );
}
