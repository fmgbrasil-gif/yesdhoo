import type { Client, Invoice, Subscription, Tenant } from '@prisma/client';
import { db } from './db';
import { recordInvoicePayment } from './cash';
import { decrypt, randomToken } from './crypto';
import { pixPayload } from './pix';
import { localDate, parseJson } from './util';
import { asaas, BankError, PAID_STATUSES, type AsaasEnv } from './bank/asaas';
import { afterPlatformInvoiceChange } from './tenant';

export type InvoiceItem = { description: string; unit?: string; quantity: number; unitCents: number };
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
export async function createInvoice(tenantId: string, data: { clientId: string; items: InvoiceItem[]; dueDate: string; competence?: string | null; notes?: string; subscriptionId?: string; installment?: number; operationId?: string | null }) {
  const amountCents = itemsTotal(data.items);
  return db.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: tenantId }, data: { invoiceSeq: { increment: 1 } }, select: { invoiceSeq: true } });
    return tx.invoice.create({
      data: {
        tenantId, clientId: data.clientId, number: t.invoiceSeq, items: JSON.stringify(data.items), amountCents, dueDate: data.dueDate,
        competence: data.competence ?? null, notes: data.notes ?? '', subscriptionId: data.subscriptionId ?? null, operationId: data.operationId ?? null, installment: data.installment ?? null, publicToken: randomToken(18), txid: `FAT${String(t.invoiceSeq).padStart(6, '0')}${randomToken(6).replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 25),
      },
    });
  });
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const competenceLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;

// ---------- cobrancas por periodo e recorrentes ----------
export const addMonths = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const dueFor = (ym: string, dueDay: number) => `${ym}-${String(Math.min(28, Math.max(1, dueDay))).padStart(2, '0')}`;

/** Ultimo dia do mes (YYYY-MM-DD) da data informada. */
export const lastDayOfMonth = (iso: string) => {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Quantas faturas futuras a cobranca recorrente mantem projetadas. */
export const RECURRING_AHEAD = 12;

/**
 * Meses que ja devem ter fatura. Periodo: todas as parcelas. Recorrente: 12 meses projetados a partir do
 * mes atual (ou do inicio, se for futuro); no ultimo dia de cada mes a janela anda mais um mes.
 */
export function monthsDue(sub: Pick<Subscription, 'mode' | 'startMonth' | 'months' | 'dueDay'>, today = localDate()) {
  if (sub.mode === 'periodo') return Array.from({ length: sub.months ?? 1 }, (_, i) => addMonths(sub.startMonth, i));
  const current = today >= lastDayOfMonth(today) ? addMonths(today.slice(0, 7), 1) : today.slice(0, 7);
  const base = sub.startMonth > current ? sub.startMonth : current;
  const until = addMonths(base, RECURRING_AHEAD - 1);
  const out: string[] = [];
  for (let m = sub.startMonth; m <= until; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Cria as faturas que faltam para uma cobranca (idempotente: um mes nunca e faturado duas vezes). */
export async function generateForSubscription(sub: Subscription, today = localDate()) {
  if (sub.status !== 'ativa') return 0;
  const done = new Set((await db.invoice.findMany({ where: { subscriptionId: sub.id }, select: { competence: true } })).map((i) => i.competence));
  const items = parseJson<InvoiceItem[]>(sub.items, []);
  const months = monthsDue(sub, today);
  let created = 0;
  for (const [i, ym] of months.entries()) {
    if (done.has(ym)) continue;
    const tag = sub.mode === 'periodo' ? ` — parcela ${i + 1}/${months.length} (${competenceLabel(ym)})` : ` — ${competenceLabel(ym)}`;
    try {
      await createInvoice(sub.tenantId, {
        clientId: sub.clientId, subscriptionId: sub.id, operationId: sub.operationId, competence: ym, installment: sub.mode === 'periodo' ? i + 1 : undefined,
        dueDate: dueFor(ym, sub.dueDay), notes: sub.notes, items: items.map((it) => ({ ...it, description: it.description + tag })),
      });
      created++;
    } catch (e) {
      // outra execucao simultanea ja criou esta fatura (indice unico de cobranca + mes)
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return created;
}

/**
 * Gera ja a primeira fatura que falta desta cobranca (botao "Gerar fatura" da Nova cobranca),
 * mesmo que o mes ainda nao tenha chegado. Devolve a fatura (nova ou a que ja existia).
 */
export async function generateFirstPending(sub: Subscription) {
  const existing = await db.invoice.findFirst({ where: { subscriptionId: sub.id, status: { not: 'cancelada' } }, orderBy: { dueDate: 'asc' } });
  if (existing) return existing;
  const items = parseJson<InvoiceItem[]>(sub.items, []);
  const ym = sub.startMonth;
  const tag = sub.mode === 'periodo' ? ` — parcela 1/${sub.months} (${competenceLabel(ym)})` : ` — ${competenceLabel(ym)}`;
  try {
    return await createInvoice(sub.tenantId, {
      clientId: sub.clientId, subscriptionId: sub.id, operationId: sub.operationId, competence: ym, installment: sub.mode === 'periodo' ? 1 : undefined,
      dueDate: dueFor(ym, sub.dueDay), notes: sub.notes, items: items.map((it) => ({ ...it, description: it.description + tag })),
    });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
    return db.invoice.findFirstOrThrow({ where: { subscriptionId: sub.id, competence: ym } });
  }
}

/** Roda todas as cobrancas ativas (de uma empresa ou de todas). Chamado pela rotina diaria e ao abrir o Financeiro. */
export async function runRecurring(tenantId?: string) {
  const subs = await db.subscription.findMany({ where: { status: 'ativa', ...(tenantId ? { tenantId } : {}) } });
  let created = 0;
  for (const s of subs) created += await generateForSubscription(s);
  return { subscriptions: subs.length, created };
}

export async function createSubscription(tenantId: string, data: { clientId: string; mode: 'periodo' | 'recorrente'; items: InvoiceItem[]; dueDay: number; startMonth: string; months?: number; notes?: string; operationId?: string | null }) {
  const sub = await db.subscription.create({
    data: {
      tenantId, clientId: data.clientId, mode: data.mode, items: JSON.stringify(data.items), amountCents: itemsTotal(data.items), dueDay: data.dueDay,
      startMonth: data.startMonth, months: data.mode === 'periodo' ? data.months : null, notes: data.notes ?? '', operationId: data.operationId ?? null,
    },
  });
  await generateForSubscription(sub);
  return sub;
}

/** Cancela a cobranca: nao gera mais faturas. Opcionalmente cancela as faturas em aberto que ainda nao venceram. */
export async function cancelSubscription(sub: Subscription, opts: { reason?: string | null; cancelOpen?: boolean }) {
  await db.subscription.update({ where: { id: sub.id }, data: { status: 'cancelada', cancelledAt: new Date(), cancelReason: opts.reason ?? null } });
  if (opts.cancelOpen === false) return 0; // padrao: cancela todas as faturas futuras em aberto
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: sub.tenantId } });
  const open = await db.invoice.findMany({ where: { subscriptionId: sub.id, status: 'aberta', dueDate: { gte: localDate() } } });
  for (const inv of open) {
    await cancelBoleto(inv, tenant).catch(() => {}); // se o banco falhar, a fatura e cancelada aqui mesmo assim
    await db.invoice.update({ where: { id: inv.id }, data: { status: 'cancelada' } });
  }
  await afterPlatformInvoiceChange(sub.clientId);
  return open.length;
}

/** Converte a "mensalidade" antiga do cadastro do cliente em cobranca recorrente (executado uma vez). */
export async function migrateLegacyFees() {
  const clients = await db.client.findMany({ where: { monthlyFeeCents: { gt: 0 } } });
  for (const c of clients) {
    const has = await db.subscription.count({ where: { clientId: c.id, status: 'ativa' } });
    if (!has) {
      const month = localDate().slice(0, 7);
      const already = await db.invoice.count({ where: { clientId: c.id, competence: month } });
      await db.subscription.create({
        data: {
          tenantId: c.tenantId, clientId: c.id, mode: 'recorrente', amountCents: c.monthlyFeeCents!, dueDay: c.dueDay ?? 10,
          startMonth: already ? addMonths(month, 1) : month,
          items: JSON.stringify([{ description: c.kind === 'parceiro' ? 'Mensalidade' : 'Veiculação de mídia indoor', quantity: 1, unitCents: c.monthlyFeeCents! }]),
        },
      });
    }
    await db.client.update({ where: { id: c.id }, data: { monthlyFeeCents: null, dueDay: null } });
  }
  return clients.length;
}

export const SUB_MODE = (s: Pick<Subscription, 'mode' | 'months'>) => (s.mode === 'periodo' ? `${s.months} ${s.months === 1 ? 'mês' : 'meses'}` : 'Recorrente');

/** Pix Copia e Cola da fatura: o do banco (baixa automatica) ou, sem banco, o gerado pela chave Pix da empresa. */
export function invoicePix(inv: Invoice, tenant: Tenant) {
  if (inv.bankPixPayload) return inv.bankPixPayload;
  if (!tenant.pixKey) return null;
  return pixPayload({ key: tenant.pixKey, name: tenant.pixName || tenant.name, city: tenant.pixCity || 'Brasil', amountCents: inv.amountCents, txid: inv.txid });
}

/** Registra o pagamento. Se for uma fatura da plataforma, pode liberar a empresa bloqueada. */
export async function markPaid(inv: Invoice, data: { paidCents?: number; method?: string; paidAt?: Date; accountId?: string | null }) {
  const updated = await db.invoice.update({
    where: { id: inv.id },
    data: { status: 'paga', paidAt: data.paidAt ?? new Date(), paidCents: data.paidCents ?? inv.amountCents, paymentMethod: data.method ?? null },
    include: { client: { select: { name: true } } },
  });
  // entrada no caixa: na conta escolhida, na conta da operacao (ex.: Caixa SkyFit) ou na conta padrao
  await recordInvoicePayment({ ...updated, clientName: updated.client.name }, data.accountId);
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
