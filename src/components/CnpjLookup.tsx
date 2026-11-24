'use client';

import { useState } from 'react';
import { ExternalLink, FileUp, Loader2, Search } from 'lucide-react';
import { importCnpjCard } from '@/app/(painel)/clientes/import';

const RECEITA = 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/';

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

  /** Preenche o formulario com os dados lidos do comprovante (cartao CNPJ). */
  const importCard = async (input: HTMLInputElement, file: File) => {
    setState({ busy: true });
    const fd = new FormData(); fd.set('card', file);
    try {
      const r = await importCnpjCard(fd);
      if (!r.ok) { setState({ msg: r.error, err: true }); return; }
      const form = input.form;
      const d = r.draft as Record<string, string>;
      const values: Record<string, string> = { ...d, phone: d.phone1 };
      if (form) for (const [field, v] of Object.entries(values)) {
        if (!v || field === name) continue;
        const el = form.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement | null;
        if (!el || !('value' in el) || el.type === 'file' || el.type === 'radio') continue;
        if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === v)) continue;
        el.value = v;
      }
      if (d.document) setValue(d.document);
      setState({ msg: `Dados importados do cartão CNPJ. ${r.notes.join(' ')} Confira antes de salvar.` });
    } catch {
      setState({ msg: 'Não foi possível ler o arquivo.', err: true });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input name={name} value={value} inputMode="numeric" className={className} placeholder="Só números"
          onChange={(e) => { const v = e.target.value; setValue(v); if (v.replace(/\D/g, '').length === 14 && value.replace(/\D/g, '').length !== 14) fill(e.target); }} />
        <button type="button" className="btn-ghost shrink-0" disabled={state.busy}
          onClick={(e) => fill((e.currentTarget.parentElement!.querySelector('input') as HTMLInputElement))}>
          {state.busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar dados
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <a href={value.replace(/\D/g, '').length === 14 ? `${RECEITA}Cnpjreva_Solicitacao.asp?cnpj=${value.replace(/\D/g, '')}` : RECEITA} target="_blank" rel="noreferrer"
          className="btn-ghost !py-1 text-xs" title="Abre o site oficial da Receita Federal numa nova aba">
          <ExternalLink size={13} /> Consultar no site da Receita
        </a>
        <span className="btn-ghost relative !py-1 text-xs" title="Envie o comprovante (cartão CNPJ) salvo em PDF no site da Receita">
          {state.busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Importar cartão CNPJ (PDF)
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Importar cartão CNPJ (PDF)" className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCard(e.target, f); e.target.value = ''; }} />
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-400">No site da Receita, resolva o “não sou um robô”, clique em Imprimir e salve como PDF; depois use “Importar cartão CNPJ”.</p>
      {state.msg && <p className={`mt-1 text-xs ${state.err ? 'text-red-600' : 'text-emerald-600'}`} role="status">{state.msg}</p>}
    </div>
  );
}
