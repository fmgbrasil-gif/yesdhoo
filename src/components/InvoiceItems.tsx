'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

type Row = { description: string; quantity: string; unit: string };
const cents = (v: string) => { const s = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v; const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Linhas da fatura (descricao, quantidade, valor unitario) com total ao vivo. */
export function InvoiceItems({ initial }: { initial?: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial?.length ? initial : [{ description: '', quantity: '1', unit: '' }]);
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const total = rows.reduce((a, r) => a + Math.round((Number(r.quantity.replace(',', '.')) || 0) * cents(r.unit)), 0);
  return (
    <div className="space-y-2">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <div className="hidden grid-cols-[1fr_70px_120px_32px] gap-2 sm:grid"><span className="label">Descrição</span><span className="label">Qtd.</span><span className="label">Valor (R$)</span></div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_120px_32px] gap-2">
          <input className="input" aria-label="Descrição" value={r.description} onChange={(e) => set(i, 'description', e.target.value)} placeholder="Ex.: Veiculação — 4 telas" />
          <input className="input" aria-label="Quantidade" inputMode="decimal" value={r.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} />
          <input className="input" aria-label="Valor unitário" inputMode="decimal" value={r.unit} onChange={(e) => set(i, 'unit', e.target.value)} placeholder="0,00" />
          <button type="button" className="text-ink-300 hover:text-red-600 disabled:opacity-30" aria-label="Remover item" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={16} /></button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { description: '', quantity: '1', unit: '' }])}><Plus size={15} /> Item</button>
        <p className="text-sm">Total: <b className="text-lg">{brl(total)}</b></p>
      </div>
    </div>
  );
}
