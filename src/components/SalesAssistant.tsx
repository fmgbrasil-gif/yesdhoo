'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { salesChat } from '@/app/(painel)/propostas/sales';
import type { ChatMsg } from '@/lib/sales-ai';

const QUICK: [string, string][] = [
  ['Primeira abordagem', 'Escreva a primeira mensagem de abordagem para este cliente no WhatsApp.'],
  ['Enviar a proposta', 'Escreva a mensagem para enviar a proposta com o link, explicando em poucas linhas o que ele ganha.'],
  ['Follow-up', 'O cliente não respondeu há alguns dias. Escreva uma mensagem de follow-up educada.'],
  ['“Está caro”', 'O cliente disse: "está caro". Como respondo?'],
  ['“Vou pensar”', 'O cliente disse: "vou pensar e te falo". Como respondo?'],
  ['“Funciona mesmo?”', 'O cliente perguntou: "isso funciona mesmo? quantas pessoas veem?". Como respondo?'],
];

/** Separa a "MENSAGEM:" pronta (para copiar/enviar) do comentario da IA. */
function split(text: string) {
  const i = text.search(/MENSAGEM:\s*/i);
  if (i < 0) return { note: text, msg: '' };
  const after = text.slice(i).replace(/^MENSAGEM:\s*/i, '');
  const end = after.search(/\n\s*\n(?=(Dica|Obs|Estratégia|Por qu|Se ele|Se o cliente|Próximo|Sugest)[^\n]*)/i);
  return { note: text.slice(0, i).trim(), msg: (end > 0 ? after.slice(0, end) : after).trim().replace(/^```\w*\n?|```$/g, '').trim(), tail: end > 0 ? after.slice(end).trim() : '' };
}

function Reply({ text, phone }: { text: string; phone: string | null }) {
  const { note, msg, tail } = split(text) as { note: string; msg: string; tail?: string };
  const [ok, setOk] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(msg); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* sem permissao */ } };
  return (
    <div className="space-y-2">
      {note && <p className="whitespace-pre-line text-sm">{note}</p>}
      {msg && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Mensagem pronta</p>
          <p className="whitespace-pre-line text-sm text-ink-800 dark:text-ink-100">{msg}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-ink-800 dark:text-emerald-200">{ok ? <Check size={13} /> : <Copy size={13} />} Copiar</button>
            <a href={`https://wa.me/${phone ?? ''}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"><MessageCircle size={13} /> Enviar no WhatsApp</a>
          </div>
        </div>
      )}
      {tail && <p className="whitespace-pre-line text-sm text-ink-500">{tail}</p>}
    </div>
  );
}

/** Botao "Me ajude a vender": chat com a IA de vendas (abordagem, follow-up e respostas as objecoes do cliente). */
export function SalesAssistant({ proposalId = null, phone = null, client, hasAi, compact = false }: { proposalId?: string | null; phone?: string | null; client?: string; hasAi: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const key = `yd-vendas:${proposalId ?? 'geral'}`;
  useEffect(() => { try { setMsgs(JSON.parse(localStorage.getItem(key) ?? '[]')); } catch { /* sem armazenamento */ } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(msgs.slice(-30))); } catch { /* sem armazenamento */ } end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, key]);

  const ask = async (content: string) => {
    const t = content.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: 'user' as const, content: t }];
    setMsgs(next); setText(''); setError(''); setBusy(true);
    const r = await salesChat(proposalId, next);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setMsgs([...next, { role: 'assistant', content: r.text }]);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#e6288a] to-[#7f4be4] font-bold text-white shadow hover:opacity-95 ${compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'}`}><Sparkles size={16} /> Me ajude a vender</button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/50" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-ink-800" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Me ajude a vender">
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#e6288a] to-[#7f4be4] px-4 py-3 text-white">
              <div><p className="flex items-center gap-2 font-black"><Sparkles size={18} /> Me ajude a vender</p><p className="text-xs opacity-90">{client ? `Cliente: ${client}` : 'Conte sobre o potencial cliente e peça ajuda'}</p></div>
              <div className="flex gap-1">
                {msgs.length > 0 && <button type="button" onClick={() => { setMsgs([]); setError(''); }} className="rounded-md p-1.5 hover:bg-white/20" title="Nova conversa" aria-label="Nova conversa"><RotateCcw size={17} /></button>}
                <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-white/20" aria-label="Fechar"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {!hasAi && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Para usar, cadastre a chave da OpenAI (ChatGPT) em <a href="/empresa#ia" className="font-semibold underline">Minha empresa → Inteligência artificial</a>.</p>}
              {msgs.length === 0 && (
                <div className="space-y-3 text-sm text-ink-600 dark:text-ink-300">
                  <p>Conte um pouco sobre o potencial cliente: o que ele vende, o público, o que ele quer divulgar, como foi o primeiro contato. A IA escreve as mensagens para o WhatsApp e ajuda a responder as perguntas e objeções dele.</p>
                  <p className="rounded-lg bg-ink-50 p-3 text-xs dark:bg-ink-900">Exemplo: “É uma escola de idiomas no centro, público jovem e pais. Querem divulgar as matrículas de janeiro. Falei com a dona, a Maria, pelo Instagram e ela pediu valores.”</p>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'ml-8 rounded-2xl rounded-tr-sm bg-brand-500 px-3 py-2 text-sm text-white' : 'mr-4 rounded-2xl rounded-tl-sm bg-ink-50 px-3 py-2 dark:bg-ink-900'}>
                  {m.role === 'user' ? <p className="whitespace-pre-line">{m.content}</p> : <Reply text={m.content} phone={phone} />}
                </div>
              ))}
              {busy && <p className="flex items-center gap-2 text-sm text-ink-400"><Loader2 size={15} className="animate-spin" /> Pensando na melhor resposta...</p>}
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div ref={end} />
            </div>
            <div className="space-y-2 border-t border-ink-100 p-3 dark:border-ink-700">
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map(([l, q]) => <button key={l} type="button" disabled={busy || !hasAi} onClick={() => ask(q)} className="rounded-full border border-ink-200 px-2.5 py-1 text-xs font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-ink-600 dark:text-ink-300">{l}</button>)}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-end gap-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} rows={2} disabled={!hasAi}
                  placeholder="Fale do cliente ou cole aqui a pergunta que ele mandou..." className="input flex-1 resize-none" />
                <button disabled={busy || !text.trim() || !hasAi} className="btn-primary h-10" aria-label="Enviar"><Send size={16} /></button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
