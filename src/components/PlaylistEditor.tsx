'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown, ArrowUp, CalendarClock, ChevronLeft, CloudUpload, Download, Eraser, Film, GripVertical, Layers, Megaphone, Newspaper, Plus, Rss, Search, Shuffle, Sparkles, Trash2, Undo2, Wrench, X, AlertTriangle,
} from 'lucide-react';
import type { Playable } from '@/lib/playables';
import { fmtDuration } from '@/lib/util';
import { MEDIA_TYPES } from '@/lib/constants';
import type { ActionResult } from './ui';
import { ContentPreview } from './ContentPreview';

const SECTIONS = [
  { key: 'midias', label: 'Minhas mídias', icon: Film },
  { key: 'grupos', label: 'Grupos de mídia', icon: Layers },
  { key: 'biblioteca', label: 'Conteúdos dinâmicos', icon: Sparkles },
  { key: 'noticias', label: 'Notícias', icon: Newspaper },
  { key: 'rss', label: 'RSS personalizado', icon: Rss },
  { key: 'avisos', label: 'Avisos', icon: Megaphone },
  { key: 'utilitarios', label: 'Utilitários', icon: Wrench },
];

type Row = { uid: number; key: string };
let seq = 0;
const row = (key: string): Row => ({ uid: ++seq, key });

function Thumb({ p }: { p: Playable }) {
  return (
    <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-800 text-[10px] font-semibold uppercase text-ink-300">
      {p.thumb ? <img src={p.thumb} alt="" className="h-full w-full object-cover" /> : (MEDIA_TYPES[p.type] ?? p.type)}{/* eslint-disable-line @next/next/no-img-element */}
      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] text-white">{fmtDuration(p.duration)}</span>
    </span>
  );
}

export function PlaylistEditor({ screenId, playables, initial, others, save, vertical = false }: {
  screenId: string; playables: Playable[]; vertical?: boolean; initial: string[]; others: { id: string; name: string; keys: string[] }[];
  save: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
}) {
  const byKey = useMemo(() => Object.fromEntries(playables.map((p) => [p.key, p])), [playables]);
  const [items, setItems] = useState<Row[]>(() => initial.filter((k) => byKey[k]).map(row));
  const [history, setHistory] = useState<Row[][]>([]);
  const [saved, setSaved] = useState(() => JSON.stringify(initial.filter((k) => byKey[k])));
  const [section, setSection] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const dirty = JSON.stringify(items.map((i) => i.key)) !== saved;
  const cycle = items.reduce((a, i) => a + (byKey[i.key]?.duration ?? 0), 0);
  const change = (next: Row[]) => { setHistory((h) => [...h.slice(-30), items]); setItems(next); setMsg(null); };
  const undo = () => { const prev = history[history.length - 1]; if (prev) { setItems(prev); setHistory(history.slice(0, -1)); } };
  const move = (from: number, to: number) => { if (to < 0 || to >= items.length || from === to) return; const next = [...items]; const [it] = next.splice(from, 1); next.splice(to, 0, it); change(next); };
  const shuffle = () => { const next = [...items]; for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; } change(next); };
  const today = new Date().toISOString().slice(0, 10);
  const expired = (p: Playable) => !!p.period && !!p.endIso && p.endIso < today;

  const list = playables.filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : p.section === section));
  const submit = () => start(async () => {
    const fd = new FormData();
    fd.set('id', screenId);
    fd.set('items', JSON.stringify(items.map((i) => i.key)));
    const r = await save(undefined, fd);
    if (r?.ok) { setSaved(JSON.stringify(items.map((i) => i.key))); setHistory([]); router.refresh(); }
    setMsg({ ok: !!r?.ok, text: r?.message ?? r?.error ?? '' });
  });
  const tool = 'flex h-8 w-8 items-center justify-center rounded-md bg-white/15 hover:bg-white/30 disabled:opacity-40';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card flex min-h-[420px] flex-col p-0">
        <div className="flex items-center gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {section && !q && <button className="btn-icon" aria-label="Voltar às categorias" onClick={() => setSection(null)}><ChevronLeft size={16} /></button>}
          <h2 className="mr-auto font-bold">{q ? 'Resultado da busca' : section ? SECTIONS.find((s) => s.key === section)?.label : 'Conteúdos'}</h2>
          <div className="relative w-64 max-w-full">
            <Search size={15} className="absolute left-3 top-2.5 text-ink-300" />
            <input className="input pl-9" placeholder="Busque pelo nome do conteúdo..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conteúdo" />
            {q && <button className="absolute right-2 top-2 text-ink-400" aria-label="Limpar busca" onClick={() => setQ('')}><X size={16} /></button>}
          </div>
        </div>
        {!section && !q ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setSection(s.key)} className="flex flex-col items-center gap-2 rounded-xl border border-ink-100 p-5 text-center text-sm font-semibold hover:border-brand-400 hover:bg-brand-50 dark:border-ink-700 dark:hover:bg-ink-700">
                <s.icon size={26} className="text-ink-500 dark:text-ink-200" />{s.label}
                <span className="text-xs font-normal text-ink-400">{playables.filter((p) => p.section === s.key).length}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid max-h-[62vh] gap-2 overflow-y-auto p-4 sm:grid-cols-2">
            {list.length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink-400">Nenhum conteúdo encontrado...</p>}
            {list.map((p) => (
              <div key={p.key} className={`group flex items-center gap-1 rounded-lg border border-ink-100 p-2 hover:border-brand-400 dark:border-ink-700 ${p.compatible ? '' : 'opacity-60'}`}>
                <button disabled={!p.compatible} onClick={() => change([...items, row(p.key)])} title={p.compatible ? 'Adicionar à playlist' : (p.reason ?? 'Não há arquivo para a orientação desta tela')}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed">
                  <Thumb p={p} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-xs text-ink-400">{p.compatible ? p.sub : `Incompatível: ${p.reason ?? 'sem arquivo para esta tela'}`}</span></span>
                </button>
                {p.preview && <ContentPreview iconOnly startVertical={vertical} h={p.preview.h} v={p.preview.v} />}
                <button disabled={!p.compatible} onClick={() => change([...items, row(p.key)])} aria-label={`Adicionar ${p.name}`} title="Adicionar à playlist" className="p-1.5 text-ink-300 hover:text-brand-600 disabled:cursor-not-allowed"><Plus size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl border-2 border-ink-900 bg-white dark:border-brand-400 dark:bg-ink-800">
        <div className="flex items-center gap-1.5 bg-ink-900 px-3 py-2.5 text-white">
          <div className="mr-auto"><p className="font-bold leading-tight">{items.length} mídias</p><p className="text-xs text-ink-300">{fmtDuration(cycle)} de ciclo</p></div>
          <button className={tool} title="Embaralhar" aria-label="Embaralhar" onClick={shuffle} disabled={items.length < 2}><Shuffle size={15} /></button>
          <button className={tool} title="Importar playlist de outra tela" aria-label="Importar playlist" onClick={() => setImporting(!importing)}><Download size={15} /></button>
          <button className={tool} title="Limpar mídias vencidas e incompatíveis" aria-label="Limpar" onClick={() => change(items.filter((i) => byKey[i.key].compatible && !expired(byKey[i.key])))}><Eraser size={15} /></button>
          <button className={tool} title="Zerar playlist" aria-label="Zerar" onClick={() => change([])} disabled={!items.length}><Trash2 size={15} /></button>
          <button className={tool} title="Desfazer" aria-label="Desfazer" onClick={undo} disabled={!history.length}><Undo2 size={15} /></button>
        </div>
        {importing && (
          <div className="border-b border-ink-100 bg-ink-50 p-3 dark:border-ink-700 dark:bg-ink-900">
            <label className="label" htmlFor="imp">Copiar a playlist de</label>
            <select id="imp" className="input" defaultValue="" onChange={(e) => { const o = others.find((x) => x.id === e.target.value); if (o) { change(o.keys.filter((k) => byKey[k]?.compatible).map(row)); setImporting(false); } }}>
              <option value="" disabled>Selecione uma tela...</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.keys.length})</option>)}
            </select>
          </div>
        )}
        <ol className="flex-1 space-y-1.5 overflow-y-auto p-2">
          {items.length === 0 && <li className="py-10 text-center text-sm text-ink-400">Nenhum conteúdo adicionado nessa playlist...</li>}
          {items.map((it, i) => {
            const p = byKey[it.key];
            return (
              <li key={it.uid} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
                className={`flex items-center gap-2 rounded-lg border border-ink-100 bg-white p-1.5 dark:border-ink-700 dark:bg-ink-800 ${drag === i ? 'opacity-40' : ''}`}>
                <GripVertical size={16} className="shrink-0 cursor-grab text-ink-300" aria-hidden />
                <Thumb p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-ink-400">
                    {!p.compatible && <AlertTriangle size={12} className="text-red-500" />}
                    {p.period ? <><CalendarClock size={12} className={expired(p) ? 'text-red-500' : ''} /> {p.period}</> : p.compatible ? p.sub : <span title={p.reason ?? ''}>Incompatível: {p.reason ?? 'sem arquivo para esta tela'}</span>}
                  </span>
                </span>
                {p.preview && <ContentPreview iconOnly startVertical={vertical} h={p.preview.h} v={p.preview.v} />}
                <span className="flex flex-col">
                  <button className="text-ink-400 hover:text-ink-900 disabled:opacity-20 dark:hover:text-white" aria-label={`Subir ${p.name}`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></button>
                  <button className="text-ink-400 hover:text-ink-900 disabled:opacity-20 dark:hover:text-white" aria-label={`Descer ${p.name}`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></button>
                </span>
                <button className="p-1 text-ink-300 hover:text-red-600" aria-label={`Remover ${p.name}`} onClick={() => change(items.filter((x) => x.uid !== it.uid))}><X size={16} /></button>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-ink-100 p-3 dark:border-ink-700">
          {dirty && <p className="mb-2 text-center text-xs font-semibold text-brand-700 dark:text-brand-300">Playlist modificada — não se esqueça de salvar.</p>}
          {msg && <p className={`mb-2 text-center text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`} role="status">{msg.text}</p>}
          <button className="btn w-full bg-emerald-600 text-white hover:bg-emerald-500" onClick={submit} disabled={pending || !dirty}><CloudUpload size={16} /> {pending ? 'Salvando...' : 'Salvar playlist'}</button>
        </div>
      </section>
    </div>
  );
}
