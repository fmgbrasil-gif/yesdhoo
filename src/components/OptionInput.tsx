'use client';

import { useId, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { addOption } from '@/app/(painel)/opcoes/actions';

/**
 * Campo com lista de opcoes cadastradas e botao + para cadastrar uma nova (fica salva para os proximos lancamentos).
 * Digitar livremente continua valendo.
 */
export function OptionInput({ name, kind, options: initial, defaultValue, required, placeholder, label }: {
  name: string; kind: 'lancamento' | 'despesa' | 'categoria' | 'fornecedor'; options: string[]; defaultValue?: string | null; required?: boolean; placeholder?: string; label: string;
}) {
  const listId = useId();
  const [options, setOptions] = useState(initial);
  const [value, setValue] = useState(defaultValue ?? '');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    const r = await addOption(kind, draft);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (!options.some((o) => o.toLowerCase() === r.value.toLowerCase())) setOptions([...options, r.value].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    setValue(r.value); setAdding(false); setDraft('');
  };
  return (
    <div>
      <div className="flex gap-1.5">
        <input name={name} list={listId} value={value} onChange={(e) => setValue(e.target.value)} required={required} placeholder={placeholder ?? (options.length ? 'Escolha da lista ou digite' : undefined)} autoComplete="off" aria-label={label} className="input" />
        <button type="button" className="btn-ghost !px-2.5 shrink-0" title={`Cadastrar ${label.toLowerCase()}`} aria-label={`Cadastrar ${label.toLowerCase()}`} aria-expanded={adding} onClick={() => { setAdding(!adding); setDraft(value); setErr(''); }}><Plus size={16} /></button>
      </div>
      <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      {adding && (
        <div className="mt-1.5 rounded-lg border border-brand-200 bg-brand-50/50 p-2 dark:border-ink-600 dark:bg-ink-900">
          <p className="mb-1 text-xs font-semibold text-ink-500">Nova opção de {label.toLowerCase()} (fica salva para os próximos lançamentos)</p>
          <div className="flex gap-1.5">
            <input value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); setAdding(false); } }} aria-label={`Nova opção de ${label.toLowerCase()}`} className="input !py-1.5" maxLength={120} />
            <button type="button" className="btn-dark !py-1.5 shrink-0" disabled={busy || !draft.trim()} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar</button>
            <button type="button" className="btn-ghost !px-2 !py-1.5 shrink-0" aria-label="Cancelar" onClick={() => setAdding(false)}><X size={14} /></button>
          </div>
          {err && <p className="mt-1 text-xs text-red-600" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
