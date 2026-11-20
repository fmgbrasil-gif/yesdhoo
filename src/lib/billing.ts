import type { Client, Invoice, Tenant } from '@prisma/client';
import { db } from './db';
import { decrypt, randomToken } from './crypto';
import { pixPayload } from './pix';
import { localDate, parseJson } from './util';
import { asaas, BankError, PAID_STATUSES, type AsaasEnv } from './bank/asaas';
import { afterPlatformInvoiceChange } from './tenant';

export type InvoiceItem = { description: string; quantity: number; unitCents: number };
export const invoiceItems = (inv: Pick<Invoice, 'items'>) => parseJson<InvoiceItem[]>(inv.items, []);
export const itemsTotal = (items: InvoiceItem[]) => items.reduce((a, i) => a + Math.round(i.quantity * i.unitCents), 0);

/** Situacao exibida: "vencida" e uma fatura aberta com vencimento ja passado. */
export function invoiceState(inv: Pick<Invoice, 'status' | 'dueDate'>) {
  if (inv.status === 'aberta' && inv.dueDate < localDate()) return 'vencida';
  return inv.status;
}

export const STATE_LABEL: Record<string, string> = { aberta: 'Em aberto', vencida: 'Vencida', paga: 'Paga', cancelada: 'Cancelada' };
export const METHODS: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', dinheiro: 'Dinheiro', cartao: 'Cartão' };

/** Cria a fatura com o proximo numero sequencial da empresa. */
export async function createInvoice(tenantId: string, data: { clientId: string; items: InvoiceItem[]; dueDate: string; competence?: string | null; notes?: string }) {
  const amountCents = itemsTotal(data.items);
  return db.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: tenantId }, data: { invoiceSeq: { increment: 1 } }, select: { invoiceSeq: true } });
    return tx.invoice.create({
      data: {
        tenantId, clientId: data.clientId, number: t.invoiceSeq, items: JSON.stringify(data.items), amountCents, dueDate: data.dueDate,
        competence: data.competence ?? null, notes: data.notes ?? '', publicToken: randomToken(18), txid: `FAT${String(t.invoiceSeq).padStart(6, '0')}${randomToken(6).replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 25),
      },
    });
  });
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const competenceLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;

/** Gera as faturas de mensalidade de um mes (YYYY-MM) para quem tem mensalidade e ainda nao foi faturado. */
export async function generateMonthly(tenantId: string, ym: string) {
  const clients = await db.client.findMany({ where: { tenantId, monthlyFeeCents: { gt: 0 } }, orderBy: { name: 'asc' } });
  const existing = new Set((await db.invoice.findMany({ where: { tenantId, competence: ym }, select: { clientId: true } })).map((i) => i.clientId));
  let created = 0;
  for (const c of clients) {
    if (existing.has(c.id)) continue;
    const day = String(Math.min(28, Math.max(1, c.dueDay ?? 10))).padStart(2, '0');
    const kindLabel = c.kind === 'parceiro' ? 'Mensalidade' : 'Veiculação de mídia indoor';
    await createInvoice(tenantId, { clientId: c.id, competence: ym, dueDate: `${ym}-${day}`, items: [{ description: `${kindLabel} — ${competenceLabel(ym)}`, quantity: 1, unitCents: c.monthlyFeeCents! }] });
    created++;
  }
  return { created, skipped: clients.length - created };
}

/** Pix Copia e Cola da fatura: o do banco (baixa automatica) ou, sem banco, o gerado pela chave Pix da empresa. */
export function invoicePix(inv: Invoice, tenant: Tenant) {
  if (inv.bankPixPayload) return inv.bankPixPayload;
  if (!tenant.pixKey) return null;
  return pixPayload({ key: tenant.pixKey, name: tenant.pixName || tenant.name, city: tenant.pixCity || 'Brasil', amountCents: inv.amountCents, txid: inv.txid });
}

/** Registra o pagamento. Se for uma fatura da plataforma, pode liberar a empresa bloqueada. */
export async function markPaid(inv: Invoice, data: { paidCents?: number; method?: string; paidAt?: Date }) {
  const updated = await db.invoice.update({
    where: { id: inv.id },
    data: { status: 'paga', paidAt: data.paidAt ?? new Date(), paidCents: data.paidCents ?? inv.amountCents, paymentMethod: data.method ?? null },
  });
  await afterPlatformInvoiceChange(inv.clientId);
  return updated;
}

// ---------- banco integrado ----------
export function bankOf(t: Tenant) {
  const apiKey = decrypt(t.bankApiKey);
  if (t.bankProvider !== 'asaas' || !apiKey) return null;
  return { env: (t.bankEnv === 'producao' ? 'producao' : 'sandbox') as AsaasEnv, apiKey };
}

/** Emite o boleto no banco (cria o cadastro do cliente no banco na primeira vez). */
export async function issueBoleto(inv: Invoice & { client: Client }, tenant: Tenant) {
  const bank = bankOf(tenant);
  if (!bank) throw new BankError('Nenhum banco configurado. Configure em Minha empresa → Banco para boletos.');
  if (inv.status !== 'aberta') throw new BankError('Só é possível gerar boleto para faturas em aberto.');
  if (inv.bankChargeId) throw new BankError('Esta fatura já tem boleto.');
  const doc = (inv.client.document ?? '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) throw new BankError(`Para emitir boleto, cadastre o CPF ou CNPJ de ${inv.client.name}.`);
  const minDue = localDate();
  if (inv.dueDate < minDue) throw new BankError('O vencimento já passou. Altere a data de vencimento antes de gerar o boleto.');
  let customer = inv.client.bankCustomerId;
  if (!customer) {
    customer = (await asaas.createCustomer(bank.env, bank.apiKey, { name: inv.client.name, cpfCnpj: doc, email: inv.client.email, phone: inv.client.phone1?.replace(/\D/g, '') || null, externalReference: inv.client.id })).id;
    await db.client.update({ where: { id: inv.client.id }, data: { bankCustomerId: customer } });
  }
  const description = invoiceItems(inv).map((i) => i.description).join('; ') || `Fatura nº ${inv.number}`;
  const charge = await asaas.createBoleto(bank.env, bank.apiKey, { customer, valueCents: inv.amountCents, dueDate: inv.dueDate, description, externalReference: inv.id });
  const [line, pix] = await Promise.all([
    asaas.identificationField(bank.env, bank.apiKey, charge.id).catch(() => null),
    asaas.pixQrCode(bank.env, bank.apiKey, charge.id).catch(() => null),
  ]);
  return db.invoice.update({
    where: { id: inv.id },
    data: { bankChargeId: charge.id, boletoUrl: charge.bankSlipUrl ?? charge.invoiceUrl ?? null, boletoLine: line?.identificationField ?? null, bankPixPayload: pix?.payload ?? null },
  });
}

/** Consulta o banco e da baixa se o boleto/Pix ja foi pago. */
export async function syncBoleto(inv: Invoice, tenant: Tenant) {
  const bank = bankOf(tenant);
  if (!bank || !inv.bankChargeId) return { paid: false };
  const p = await asaas.getPayment(bank.env, bank.apiKey, inv.bankChargeId);
  if (PAID_STATUSES.includes(p.status) && inv.status !== 'paga') {
    await markPaid(inv, { paidCents: Math.round(p.value * 100), method: 'boleto', paidAt: p.paymentDate || p.clientPaymentDate ? new Date(`${p.paymentDate || p.clientPaymentDate}T12:00:00`) : new Date() });
    return { paid: true };
  }
  return { paid: PAID_STATUSES.includes(p.status) };
}

export async function cancelBoleto(inv: Invoice, tenant: Tenant) {
  const bank = bankOf(tenant);
  if (bank && inv.bankChargeId) await asaas.deletePayment(bank.env, bank.apiKey, inv.bankChargeId);
}

/** Endereco publico da fatura (o cliente abre para ver e pagar). */
export const invoiceLink = (inv: Pick<Invoice, 'publicToken'>) => `/fatura/${inv.publicToken}`;
