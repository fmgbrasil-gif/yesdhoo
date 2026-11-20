import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { markPaid } from '@/lib/billing';
import { afterPlatformInvoiceChange } from '@/lib/tenant';

/**
 * Aviso automatico do Asaas quando uma cobranca muda de situacao.
 * Configure no Asaas o endereco /api/webhooks/asaas/<id da empresa> e o token mostrado em Minha empresa.
 * O Asaas pode repetir o mesmo aviso; o tratamento abaixo e idempotente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantId } = await params;
  const t = await db.tenant.findUnique({ where: { id: tenantId } });
  const sent = req.headers.get('asaas-access-token') ?? '';
  const ok = !!t?.bankWebhookToken && sent.length === t.bankWebhookToken.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(t.bankWebhookToken));
  if (!t || !ok) return Response.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const event: string = body?.event ?? '';
  const pay = body?.payment;
  if (!pay?.id) return Response.json({ ok: true });
  const inv = await db.invoice.findFirst({ where: { tenantId: t.id, bankChargeId: String(pay.id) } });
  if (!inv) return Response.json({ ok: true }); // cobranca criada fora do sistema

  if ((event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') && inv.status === 'aberta') {
    const date = pay.paymentDate || pay.clientPaymentDate;
    await markPaid(inv, { paidCents: Math.round(Number(pay.value) * 100) || inv.amountCents, method: pay.billingType === 'PIX' ? 'pix' : 'boleto', paidAt: date ? new Date(`${date}T12:00:00`) : new Date() });
  } else if (event === 'PAYMENT_DELETED' && inv.status === 'aberta') {
    await db.invoice.update({ where: { id: inv.id }, data: { bankChargeId: null, boletoUrl: null, boletoLine: null, bankPixPayload: null } });
  } else if ((event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') && inv.status === 'paga') {
    await db.invoice.update({ where: { id: inv.id }, data: { status: 'aberta', paidAt: null, paidCents: null, paymentMethod: null } });
    await afterPlatformInvoiceChange(inv.clientId);
  }
  return Response.json({ ok: true });
}
