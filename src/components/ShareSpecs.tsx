'use client';

import { useState } from 'react';
import { Copy, Link2, MessageCircle } from 'lucide-react';
import { specsText } from '@/lib/media-specs';

/** Botoes para enviar as especificacoes de midia por WhatsApp, copiar o texto ou o link. */
export function ShareSpecs({ link, compact = false }: { link: string; compact?: boolean }) {
  const [msg, setMsg] = useState('');
  const copy = async (t: string, ok: string) => {
    try { await navigator.clipboard.writeText(t); setMsg(ok); } catch { setMsg('Não foi possível copiar'); }
    setTimeout(() => setMsg(''), 2500);
  };
  const btn = 'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold';
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5'}>
      <a href={`https://wa.me/?text=${encodeURIComponent(specsText(link))}`} target="_blank" rel="noreferrer" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><MessageCircle size={16} /> Enviar por WhatsApp</a>
      <button type="button" onClick={() => copy(specsText(link), 'Texto copiado')} className={`${btn} bg-gray-100 hover:bg-gray-200 dark:bg-ink-700`}><Copy size={16} /> Copiar texto</button>
      <button type="button" onClick={() => copy(link, 'Link copiado')} className={`${btn} bg-gray-100 hover:bg-gray-200 dark:bg-ink-700`}><Link2 size={16} /> Copiar link</button>
      {msg && <span className="text-sm text-emerald-700">{msg}</span>}
    </div>
  );
}
