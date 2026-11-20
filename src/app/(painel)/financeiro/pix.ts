'use server';

import QRCode from 'qrcode';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDate, fmtMoney } from '@/lib/money';
import { competenceLabel, invoiceLink, invoicePix } from '@/lib/billing';
import { pixFileName } from '@/lib/doc-names';

export type PixData =
  | { ok: false; error: string }
  | { ok: true; payload: string; qr: string; amount: string; due: string; ref: string; clientName: string; phone: string | null; link: string; payLink: string; pixLink: string; pixFile: string; whatsappText: string };

/** Pix Copia e Cola de uma fatura em aberto, com QR Code e a mensagem pronta para o WhatsApp do cliente. */
export async function invoicePixData(id: string, origin: string): Promise<PixData> {
  const user = await requireAdmin();
  const inv = await db.invoice.findFirst({ where: { id, tenantId: user.tenantId }, include: { client: true } });
  if (!inv) return { ok: false, error: 'Fatura não encontrada.' };
  if (inv.status !== 'aberta') return { ok: false, error: inv.status === 'paga' ? 'Esta fatura já foi paga.' : 'Esta fatura foi cancelada.' };
  const payload = invoicePix(inv, user.tenant);
  if (!payload) return { ok: false, error: 'Cadastre a chave Pix em Minha empresa para gerar o Pix.' };
  const qr = await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
  const base = /^https?:\/\/[\w.:-]+$/.test(origin) ? origin : '';
  const link = base + invoiceLink(inv);
  const ref = inv.competence ? competenceLabel(inv.competence) : `vencimento ${fmtDate(inv.dueDate)}`;
  const name = inv.client.tradeName || inv.client.name;
  const payLink = `${link}/pagar`;
  // o link de pagamento vem primeiro: ele abre a pagina com o botao "Copiar codigo Pix"
  const whatsappText = [
    `Olá, ${name}! Segue o Pix da fatura nº ${inv.number} (${ref}) de ${user.tenant.tradeName || user.tenant.name}.`,
    `Valor: *${fmtMoney(inv.amountCents)}* · Vencimento: ${fmtDate(inv.dueDate)}`,
    '',
    '👉 Toque no link para *copiar o código Pix* com um clique:',
    payLink,
    '',
    'Se preferir, copie o código Pix Copia e Cola abaixo:',
    payload,
  ].join('\n');
  const digits = (inv.client.phone1 ?? '').replace(/\D/g, '');
  return {
    ok: true, payload, qr, amount: fmtMoney(inv.amountCents), due: fmtDate(inv.dueDate), ref, clientName: inv.client.name,
    phone: digits.length >= 10 ? (digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`) : null,
    link, payLink, pixLink: `${link}/pix`, pixFile: pixFileName(inv, inv.client), whatsappText,
  };
}
