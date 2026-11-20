'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import { parseMoney } from '@/lib/money';
import { BankError } from '@/lib/bank/asaas';
import { cancelBoleto, createInvoice, generateMonthly, issueBoleto, markPaid, METHODS, syncBoleto, type InvoiceItem } from '@/lib/billing';
import { afterPlatformInvoiceChange } from '@/lib/tenant';
import type { ActionResult } from '@/components/ui';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function ownInvoice(tenantId: string, id: string) {
  return db.invoice.findFirst({ where: { id, tenantId }, include: { client: true } });
}

function readItems(fd: FormData): InvoiceItem[] | string {
  let raw: { description?: string; quantity?: string; unit?: string }[];
  try { raw = JSON.parse(String(fd.get('items') || '[]')); } catch { return 'Itens inválidos.'; }
  const items: InvoiceItem[] = [];
  for (const r of raw) {
    const description = String(r.description ?? '').trim().slice(0, 200);
    const quantity = Number(String(r.quantity ?? '1').replace(',', '.'));
    const unitCents = parseMoney(r.unit);
    if (!description && !r.unit) continue;
    if (!description) return 'Preencha a descrição de todos os itens.';
    if (!Number.isFinite(quantity) || quantity <= 0) return `Quantidade inválida em “${description}”.`;
    if (unitCents == null) return `Valor inválido em “${description}”. Use o formato 1.500,00.`;
    items.push({ description, quantity, unitCents });
  }
  if (!items.length) return 'Inclua ao menos um item na fatura.';
  return items;
}

export async function saveInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const client = await db.client.findFirst({ where: { id: String(fd.get('clientId')), tenantId: user.tenantId } });
  if (!client) return { error: 'Escolha o cliente.' };
  const dueDate = str(fd, 'dueDate');
  if (!dueDate || !DATE.test(dueDate)) return { error: 'Informe a data de vencimento.' };
  const items = readItems(fd);
  if (typeof items === 'string') return { error: items };
  if (items.reduce((a, i) => a + i.quantity * i.unitCents, 0) <= 0) return { error: 'O total da fatura precisa ser maior que zero.' };
  await createInvoice(user.tenantId, { clientId: client.id, items, dueDate, notes: str(fd, 'notes') ?? '' });
  revalidatePath('/financeiro');
  return { ok: true };
}

export async function generateMonth(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const ym = String(fd.get('month') ?? '');
  if (!/^\d{4}-\d{2}$/.test(ym)) return { error: 'Escolha o mês.' };
  const r = await generateMonthly(user.tenantId, ym);
  revalidatePath('/financeiro');
  if (!r.created && !r.skipped) return { error: 'Nenhum cliente com mensalidade. Preencha a mensalidade no cadastro de clientes e parceiros.' };
  if (!r.created) return { error: 'As mensalidades deste mês já foram geradas para todos os clientes e parceiros com mensalidade.' };
  return { ok: true, message: `${r.created} fatura(s) gerada(s).` };
}

export async function payInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv || inv.status !== 'aberta') return { error: 'Fatura não encontrada ou já encerrada.' };
  const paidCents = parseMoney(str(fd, 'paid')) ?? inv.amountCents;
  const method = String(fd.get('method') ?? '');
  const paidAt = str(fd, 'paidAt');
  await markPaid(inv, { paidCents, method: METHODS[method] ? method : undefined, paidAt: paidAt && DATE.test(paidAt) ? new Date(`${paidAt}T12:00:00`) : new Date() });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function reopenInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv || inv.status !== 'paga') return { error: 'Só é possível estornar uma fatura paga.' };
  await db.invoice.update({ where: { id: inv.id }, data: { status: 'aberta', paidAt: null, paidCents: null, paymentMethod: null } });
  await afterPlatformInvoiceChange(inv.clientId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function cancelInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv || inv.status !== 'aberta') return { error: 'Só é possível cancelar uma fatura em aberto.' };
  try { await cancelBoleto(inv, user.tenant); } catch (e) { if (e instanceof BankError) return { error: `Não foi possível cancelar o boleto no banco: ${e.message}` }; throw e; }
  await db.invoice.update({ where: { id: inv.id }, data: { status: 'cancelada' } });
  await afterPlatformInvoiceChange(inv.clientId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function changeDueDate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  const dueDate = str(fd, 'dueDate');
  if (!inv || inv.status !== 'aberta') return { error: 'Só é possível alterar uma fatura em aberto.' };
  if (!dueDate || !DATE.test(dueDate)) return { error: 'Data inválida.' };
  if (inv.bankChargeId) return { error: 'Esta fatura tem boleto emitido. Cancele-a e gere uma nova com o vencimento certo.' };
  await db.invoice.update({ where: { id: inv.id }, data: { dueDate } });
  await afterPlatformInvoiceChange(inv.clientId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function boletoInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv) return { error: 'Fatura não encontrada.' };
  try {
    await issueBoleto(inv, user.tenant);
  } catch (e) {
    if (e instanceof BankError) return { error: e.message };
    throw e;
  }
  revalidatePath('/financeiro');
  return { ok: true };
}

export async function syncInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv) return { error: 'Fatura não encontrada.' };
  try {
    const r = await syncBoleto(inv, user.tenant);
    revalidatePath('/', 'layout');
    return { ok: true, message: r.paid ? 'Pagamento confirmado pelo banco.' : 'O banco ainda não registrou o pagamento.' };
  } catch (e) {
    if (e instanceof BankError) return { error: e.message };
    throw e;
  }
}
