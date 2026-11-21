'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, Mail, MessageCircle, QrCode } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { Modal } from './ui';
import { invoicePixData, type PixData } from '@/app/(painel)/financeiro/pix';

/** QR Code, Pix Copia e Cola e envio pelo WhatsApp de uma fatura. */
export function PixPanel({ invoiceId }: { invoiceId: string }) {
  const [data, setData] = useState<PixData | null>(null);
  useEffect(() => { invoicePixData(invoiceId, window.location.origin).then(setData).catch(() => setData({ ok: false, error: 'Não foi possível gerar o Pix.' })); }, [invoiceId]);
  if (!data) return <p className="flex items-center gap-2 text-sm text-ink-400"><Loader2 size={15} className="animate-spin" /> Gerando o Pix...</p>;
  if (!data.ok) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200" role="alert">{data.error}</p>;
  const wa = `https://wa.me/${data.phone ?? ''}?text=${encodeURIComponent(data.whatsappText)}`;
  // so o codigo, numa mensagem separada: o cliente segura o dedo e copia exatamente o Pix
  const waCode = `https://wa.me/${data.phone ?? ''}?text=${encodeURIComponent(data.payload)}`;
  const mail = `mailto:${data.email ?? ''}?subject=${encodeURIComponent(`${data.company} — fatura nº ${data.number} (${data.ref})`)}&body=${encodeURIComponent(data.whatsappText.replace(/\*/g, '').replace('👉 ', ''))}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <img src={data.qr} alt="QR Code Pix" width={150} height={150} className="rounded-lg ring-1 ring-ink-100" />{/* eslint-disable-line @next/next/no-img-element */}
        <div>
          <p className="text-2xl font-black tabular-nums">{data.amount}</p>
          <p className="text-sm text-ink-500">{data.clientName}</p>
          <p className="text-sm text-ink-500">{data.ref} · vence em {data.due}</p>
        </div>
      </div>
      <div>
        <p className="label">Pix Copia e Cola</p>
        <p className="select-all break-all rounded-lg bg-ink-50 p-3 font-mono text-xs dark:bg-ink-900">{data.payload}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={data.payload} label="Copiar código Pix" />
        <CopyButton text={data.whatsappText} label="Copiar mensagem" />
        <a href={wa} target="_blank" rel="noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-500"><MessageCircle size={15} /> Enviar pelo WhatsApp</a>
        <a href={waCode} target="_blank" rel="noreferrer" className="btn-ghost" title="Envia só o código, numa mensagem separada, para o cliente copiar segurando o dedo"><MessageCircle size={15} /> Enviar só o código</a>
        <a href={mail} className="btn-ghost"><Mail size={15} /> Enviar por e-mail</a>
        <a href={`${data.link}?baixar=1`} target="_blank" rel="noreferrer" className="btn-ghost"><Download size={15} /> PDF da fatura</a>
        <a href={`${data.pixLink}?baixar=1`} target="_blank" rel="noreferrer" className="btn-ghost"><Download size={15} /> PDF do Pix</a>
        <a href={data.payLink} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink size={15} /> Página de pagamento</a>
      </div>
      <p className="text-xs text-ink-400">A mensagem leva o cliente à página de pagamento, onde um toque copia o código Pix. Use <b>Enviar só o código</b> logo depois para mandar o código numa mensagem separada, fácil de copiar.</p>
      {!data.phone && <p className="text-xs text-ink-400">O cadastro do cliente não tem celular: o WhatsApp abre para você escolher o contato.</p>}
    </div>
  );
}

/** Botao "Gerar Pix" da lista de cobrancas. O Pix so e montado ao abrir. */
export function PixButton({ invoiceId, number }: { invoiceId: string; number: number }) {
  return (
    <Modal trigger={<><QrCode size={15} /> Pix</>} triggerClass="btn-ghost !px-2.5 !py-1.5" titleAttr="Gerar Pix" title={`Pix da fatura ${number}`}>
      <PixPanel invoiceId={invoiceId} />
    </Modal>
  );
}
