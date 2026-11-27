'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { markProposalSent } from '@/app/(painel)/propostas/actions';

/** Enviar a proposta pelo WhatsApp do cliente (ou copiar o link) e marcar como enviada. */
export function ProposalSend({ id, url, phone, text }: { id: string; url: string; phone: string | null; text: string }) {
  const [ok, setOk] = useState(false);
  const router = useRouter();
  const mark = async () => { const fd = new FormData(); fd.set('id', id); await markProposalSent(undefined, fd); router.refresh(); };
  const send = () => { window.open(`https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`, '_blank'); mark(); };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 2000); mark(); } catch { /* sem permissao */ } };
  return (
    <>
      <button type="button" onClick={send} className="btn bg-emerald-600 text-white hover:bg-emerald-500" title={phone ? 'Abre o WhatsApp do cliente com a mensagem pronta' : 'Sem WhatsApp no cadastro: escolha o contato'}><MessageCircle size={16} /> Enviar pelo WhatsApp</button>
      <button type="button" onClick={copy} className="btn-ghost">{ok ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />} Copiar link</button>
    </>
  );
}
