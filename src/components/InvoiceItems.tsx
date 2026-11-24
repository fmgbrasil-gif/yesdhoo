'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { centsToText, MoneyInput } from './MoneyInput';
import { createService, deleteService } from '@/app/(painel)/financeiro/services';

export type ServiceOpt = { id: string; name: string; unit: string; priceCents: number };
type Row = { description: string; unit: string; quantity: string; unit_price: string };

const cents = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) * 100 || 0;
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const empty = (): Row => ({ description: '', unit: 'mês', quantity: '1', unit_price: '0,00' });

/** Linhas da fatura (descricao, unidade, quantidade, valor) com total ao vivo e atalho para o catalogo de servicos. */
export function InvoiceItems({ initial, services: initialServices = [], suggest, extraSuggestions = [] }: {
  initial?: { description: string; unit?: string; quantity: number; unitCents: number }[]; services?: ServiceOpt[];
  /** descricao sugerida (ex.: ao escolher a operacao); so preenche a 1a linha se estiver vazia ou com a sugestao anterior */
  suggest?: string;
  /** outras sugestoes para o campo Descricao (ex.: uma por operacao) */
  extraSuggestions?: string[];
}) {
  const [rows, setRows] = useState<Row[]>(initial?.length
    ? initial.map((i) => ({ description: i.description, unit: i.unit ?? 'un', quantity: String(i.quantity).replace('.', ','), unit_price: centsToText(i.unitCents) }))
    : [empty()]);
  const [services, setServices] = useState(initialServices);
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState({ name: '', unit: 'mês', price: '0,00' });
  const [msg, setMsg] = useState('');
  const [lastSuggest, setLastSuggest] = useState('');
  useEffect(() => {
    if (!suggest) return;
    setRows((rs) => (rs[0] && (!rs[0].description || rs[0].description === lastSuggest) ? [{ ...rs[0], description: suggest }, ...rs.slice(1)] : rs));
    setLastSuggest(suggest);
  }, [suggest]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // descricao igual a um servico cadastrado (escolhido na lista): preenche unidade e valor
  const setDescription = (i: number, v: string) => {
    const s = services.find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase());
    setRows(rows.map((r, j) => (j === i ? (s ? { ...r, description: s.name, unit: s.unit, unit_price: centsToText(s.priceCents) } : { ...r, description: v }) : r)));
  };
  const total = rows.reduce((a, r) => a + Math.round((Number(r.quantity.replace(',', '.')) || 0) * cents(r.unit_price)), 0);

  const addService = (s: ServiceOpt) => {
    const line = { description: s.name, unit: s.unit, quantity: '1', unit_price: centsToText(s.priceCents) };
    // substitui a primeira linha se ela ainda estiver em branco
    setRows(rows.length === 1 && !rows[0].description && cents(rows[0].unit_price) === 0 ? [line] : [...rows, line]);
    setPicker(false);
  };
  const saveService = async () => {
    setMsg('');
    const fd = new FormData();
    fd.set('name', draft.name); fd.set('unit', draft.unit); fd.set('price', draft.price);
    const r = await createService(fd);
    if (!r.ok) { setMsg(r.error); return; }
    setServices([...services, r.service].sort((a, b) => a.name.localeCompare(b.name)));
    addService(r.service);
    setDraft({ name: '', unit: 'mês', price: '0,00' });
  };
  const removeService = async (id: string) => {
    const fd = new FormData(); fd.set('id', id);
    await deleteService(fd);
    setServices(services.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-2">
      <datalist id="servicos-cadastrados">{services.map((s) => <option key={s.id} value={s.name}>{`${brl(s.priceCents)} / ${s.unit}`}</option>)}{extraSuggestions.filter((x) => !services.some((s) => s.name === x)).map((x) => <option key={x} value={x}>operação</option>)}</datalist>
      <input type="hidden" name="items" value={JSON.stringify(rows.map((r) => ({ description: r.description, unit: r.unit, quantity: r.quantity, price: r.unit_price })))} />
      <div className="hidden grid-cols-[1fr_70px_60px_130px_28px] gap-2 sm:grid"><span className="label">Descrição</span><span className="label">Unid.</span><span className="label">Qtd.</span><span className="label">Valor unit.</span></div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_60px_130px_28px] gap-2">
          <input className="input" aria-label="Descrição" list="servicos-cadastrados" autoComplete="off" value={r.description} onChange={(e) => setDescription(i, e.target.value)} placeholder={services.length ? 'Escolha um serviço ou digite um novo' : 'Ex.: Veiculação — 4 telas'} />
          <input className="input" aria-label="Unidade" value={r.unit} onChange={(e) => set(i, 'unit', e.target.value)} />
          <input className="input" aria-label="Quantidade" inputMode="decimal" value={r.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} />
          <MoneyInput label="Valor unitário" value={r.unit_price} onChange={(v) => set(i, 'unit_price', v)} />
          <button type="button" className="text-ink-300 hover:text-red-600 disabled:opacity-30" aria-label="Remover item" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={16} /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setRows([...rows, empty()])}><Plus size={15} /> Item</button>
          <button type="button" className="btn-ghost" aria-expanded={picker} onClick={() => setPicker(!picker)}><Plus size={15} /> Serviços</button>
        </div>
        <p className="text-sm">Total: <b className="text-lg tabular-nums">{brl(total)}</b></p>
      </div>
      {picker && (
        <div className="space-y-3 rounded-lg border border-ink-100 bg-ink-50 p-3 dark:border-ink-700 dark:bg-ink-900">
          <p className="text-sm font-semibold">Serviços cadastrados</p>
          <p className="text-xs text-ink-400">Descrições novas usadas numa cobrança entram aqui automaticamente.</p>
          {services.length === 0 && <p className="text-xs text-ink-400">Nenhum serviço ainda. Cadastre abaixo os serviços que você presta para usar nas cobranças.</p>}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {services.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <button type="button" onClick={() => addService(s)} className="flex flex-1 items-center justify-between rounded-md bg-white px-3 py-2 text-left text-sm hover:ring-2 hover:ring-brand-300 dark:bg-ink-800">
                  <span>{s.name} <span className="text-xs text-ink-400">/ {s.unit}</span></span><span className="tabular-nums">{brl(s.priceCents)}</span>
                </button>
                <button type="button" className="p-1 text-ink-300 hover:text-red-600" aria-label={`Excluir serviço ${s.name}`} onClick={() => removeService(s.id)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_70px_130px_auto] items-end gap-2 border-t border-ink-100 pt-3 dark:border-ink-700">
            <label className="text-xs text-ink-400">Novo serviço<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Criação de vídeo 15s" /></label>
            <label className="text-xs text-ink-400">Unid.<input className="input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></label>
            <label className="text-xs text-ink-400">Preço<MoneyInput value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} label="Preço do serviço" /></label>
            <button type="button" className="btn-dark" onClick={saveService} disabled={!draft.name.trim()}>Cadastrar e usar</button>
          </div>
          {msg && <p className="text-xs text-red-600" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
}
