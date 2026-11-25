'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react';

/** Botoes do relatorio do cliente: abrir, enviar pelo WhatsApp e copiar o link. */
export function ClientReportSend({ url, phone, text }: { url: string; phone: string | null; text: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sem permissao */ } };
  const btn = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold';
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      <a href={url} target="_blank" rel="noreferrer" className={`${btn} border-ink-200 hover:bg-ink-50 dark:border-ink-600 dark:hover:bg-ink-700`} title="Abrir o relatório do cliente"><ExternalLink size={13} /> Relatório</a>
      <a href={`https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={`${btn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500`} title={phone ? 'Enviar para o WhatsApp do cliente' : 'Cliente sem celular: escolha o contato no WhatsApp'}><MessageCircle size={13} /> WhatsApp</a>
      <button type="button" onClick={copy} className={`${btn} border-ink-200 hover:bg-ink-50 dark:border-ink-600 dark:hover:bg-ink-700`} title="Copiar link">{ok ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}</button>
    </span>
  );
}
