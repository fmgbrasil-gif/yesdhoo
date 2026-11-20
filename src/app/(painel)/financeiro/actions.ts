'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import { parseMoney } from '@/lib/money';
import { BankError } from '@/lib/bank/asaas';
import { cancelBoleto, cancelSubscription, competenceLabel, createInvoice, createSubscription, dueFor, issueBoleto, itemsTotal, markPaid, METHODS, syncBoleto, type InvoiceItem } from '@/lib/billing';
import { localDate } from '@/lib/util';
import { ContractError, draftContract, type Attachment } from '@/lib/ai-contract';
import { isUpload } from '@/lib/storage';
import { afterPlatformInvoiceChange } from '@/lib/tenant';
import type { ActionResult } from '@/components/ui';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function ownInvoice(tenantId: string, id: string) {
  return db.invoice.findFirst({ where: { id, tenantId }, include: { client: true } });
}

function readItems(fd: FormData): InvoiceItem[] | string {
  let raw: { description?: string; quantity?: string; unit?: string; price?: string }[];
  try { raw = JSON.parse(String(fd.get('items') || '[]')); } catch { return 'Itens inválidos.'; }
  const items: InvoiceItem[] = [];
  for (const r of raw) {
    const description = String(r.description ?? '').trim().slice(0, 200);
    const quantity = Number(String(r.quantity ?? '1').replace(',', '.'));
    const unitCents = parseMoney(r.price);
    const unit = String(r.unit ?? '').trim().slice(0, 12) || 'un';
    if (!description && !unitCents) continue;
    if (!description) return 'Preencha a descrição de todos os itens.';
    if (!Number.isFinite(quantity) || quantity <= 0) return `Quantidade inválida em “${description}”.`;
    if (unitCents == null) return `Valor inválido em “${description}”. Use o formato 1.500,00.`;
    if (!unitCents) return `Informe o valor de “${description}”.`;
    items.push({ description, unit, quantity, unitCents });
  }
  if (!items.length) return 'Inclua ao menos um item na fatura.';
  return items;
}

/** Nova cobranca: avulsa (uma fatura), por periodo (N meses, todas as faturas de uma vez) ou recorrente (todo mes ate cancelar). */
export async function saveCharge(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const client = await db.client.findFirst({ where: { id: String(fd.get('clientId')), tenantId: user.tenantId } });
  if (!client) return { error: 'Escolha o cliente.' };
  if (!client.active) return { error: `${client.name} está desativado. Reative o cadastro antes de cobrar.` };
  const items = readItems(fd);
  if (typeof items === 'string') return { error: items };
  if (items.reduce((a, i) => a + i.quantity * i.unitCents, 0) <= 0) return { error: 'O total precisa ser maior que zero.' };
  const notes = str(fd, 'notes') ?? '';
  const mode = String(fd.get('mode'));
  if (mode === 'avulsa') {
    const dueDate = str(fd, 'dueDate');
    if (!dueDate || !DATE.test(dueDate)) return { error: 'Informe a data de vencimento.' };
    await createInvoice(user.tenantId, { clientId: client.id, items, dueDate, notes });
    revalidatePath('/financeiro');
    return { ok: true };
  }
  if (mode !== 'periodo' && mode !== 'recorrente') return { error: 'Escolha o tipo de cobrança.' };
  const startMonth = str(fd, 'startMonth');
  if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) return { error: 'Informe o mês da primeira cobrança.' };
  const dueDay = Number(str(fd, 'dueDay'));
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return { error: 'O dia de vencimento deve ficar entre 1 e 28.' };
  const months = Number(str(fd, 'months'));
  if (mode === 'periodo' && (!Number.isInteger(months) || months < 2 || months > 60)) return { error: 'O período deve ter entre 2 e 60 meses.' };
  await createSubscription(user.tenantId, { clientId: client.id, mode, items, dueDay, startMonth, months: mode === 'periodo' ? months : undefined, notes });
  revalidatePath('/financeiro');
  return { ok: true, message: mode === 'periodo' ? `${months} faturas geradas.` : 'Cobrança recorrente criada. As faturas serão geradas todo mês automaticamente.' };
}

export async function cancelCharge(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const sub = await db.subscription.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId, status: 'ativa' } });
  if (!sub) return { error: 'Cobrança não encontrada ou já cancelada.' };
  const n = await cancelSubscription(sub, { reason: str(fd, 'reason'), cancelOpen: fd.get('cancelOpen') === 'on' });
  revalidatePath('/', 'layout');
  return { ok: true, message: n ? `Cobrança cancelada e ${n} fatura(s) futura(s) canceladas.` : 'Cobrança cancelada. Nenhuma fatura nova será gerada.' };
}

/** Gera o contrato com IA e abre a pagina dele para revisar. */
export async function generateContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const client = await db.client.findFirst({ where: { id: String(fd.get('clientId')), tenantId: user.tenantId } });
  if (!client) return { error: 'Escolha o cliente.' };
  const subId = str(fd, 'subscriptionId');
  const sub = subId ? await db.subscription.findFirst({ where: { id: subId, tenantId: user.tenantId, clientId: client.id } }) : null;
  if (subId && !sub) return { error: 'Cobrança não encontrada para este cliente.' };
  const screens = (await db.screen.findMany({
    where: { tenantId: user.tenantId, OR: [{ clientId: client.id }, { items: { some: { media: { clientId: client.id } } } }] },
    select: { name: true, city: true, state: true }, orderBy: { name: 'asc' }, take: 30,
  })).map((s) => [s.name, s.city && `${s.city}${s.state ? '/' + s.state : ''}`].filter(Boolean).join(' — '));
  // anexos opcionais: PDF ou imagens, ate 5 arquivos e 4 MB no total (limite de envio do servidor)
  const files = fd.getAll('attachments').filter(isUpload);
  const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (files.length > 5) return { error: 'Anexe no máximo 5 arquivos.' };
  if (files.reduce((a, f) => a + f.size, 0) > 4 * 1024 * 1024) return { error: 'Os anexos passam de 4 MB. Envie arquivos menores ou menos arquivos.' };
  const bad = files.find((f) => !ALLOWED.includes(f.type));
  if (bad) return { error: `“${bad.name}” não é PDF nem imagem (PNG, JPG, WEBP ou GIF).` };
  const attachments: Attachment[] = await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type, data: Buffer.from(await f.arrayBuffer()).toString('base64') })));
  let body: string;
  try {
    body = await draftContract(user.tenant, client, sub, String(fd.get('extra') ?? ''), screens, attachments);
  } catch (e) {
    if (e instanceof ContractError) return { error: e.message };
    throw e;
  }
  const title = `Contrato — ${client.name}${sub ? ` (${sub.mode === 'periodo' ? `${sub.months} meses` : 'recorrente'})` : ''}`;
  const contract = await db.contract.create({ data: { tenantId: user.tenantId, clientId: client.id, subscriptionId: sub?.id ?? null, title, body } });
  redirect(`/contratos/${contract.id}`);
}

export async function saveContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const c = await db.contract.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!c) return { error: 'Contrato não encontrado.' };
  const body = String(fd.get('body') ?? '').trim();
  if (!body) return { error: 'O contrato não pode ficar vazio.' };
  await db.contract.update({ where: { id: c.id }, data: { body: body.slice(0, 100_000), title: str(fd, 'title') ?? c.title } });
  revalidatePath(`/contratos/${c.id}`);
  return { ok: true, message: 'Contrato salvo.' };
}

export async function deleteContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  await db.contract.deleteMany({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  redirect('/financeiro?aba=contratos');
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

/** Edita uma fatura em aberto sem boleto: itens, vencimento e observacoes. */
export async function updateInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv || inv.status !== 'aberta') return { error: 'Só é possível editar faturas em aberto.' };
  if (inv.bankChargeId) return { error: 'Esta fatura tem boleto emitido no banco. Cancele-a e crie outra com os dados certos.' };
  const dueDate = str(fd, 'dueDate');
  if (!dueDate || !DATE.test(dueDate)) return { error: 'Informe o vencimento.' };
  const items = readItems(fd);
  if (typeof items === 'string') return { error: items };
  await db.invoice.update({ where: { id: inv.id }, data: { items: JSON.stringify(items), amountCents: itemsTotal(items), dueDate, notes: str(fd, 'notes') ?? '' } });
  await afterPlatformInvoiceChange(inv.clientId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Edita uma cobranca por periodo/recorrente: itens, dia de vencimento e observacoes valem para as proximas faturas.
 * Opcionalmente aplica tambem as faturas em aberto que ainda nao venceram (e sem boleto emitido).
 */
export async function updateCharge(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const sub = await db.subscription.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId, status: 'ativa' } });
  if (!sub) return { error: 'Cobrança não encontrada ou cancelada.' };
  const items = readItems(fd);
  if (typeof items === 'string') return { error: items };
  const dueDay = Number(str(fd, 'dueDay'));
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return { error: 'O dia de vencimento deve ficar entre 1 e 28.' };
  const notes = str(fd, 'notes') ?? '';
  const updated = await db.subscription.update({ where: { id: sub.id }, data: { items: JSON.stringify(items), amountCents: itemsTotal(items), dueDay, notes } });
  let changed = 0;
  if (fd.get('applyOpen') === 'on') {
    const open = await db.invoice.findMany({ where: { subscriptionId: sub.id, status: 'aberta', bankChargeId: null, dueDate: { gte: localDate() } } });
    for (const inv of open) {
      const ym = inv.competence!;
      const tag = sub.mode === 'periodo' ? ` — parcela ${inv.installment}/${sub.months} (${competenceLabel(ym)})` : ` — ${competenceLabel(ym)}`;
      const its = items.map((it) => ({ ...it, description: it.description + tag }));
      await db.invoice.update({ where: { id: inv.id }, data: { items: JSON.stringify(its), amountCents: itemsTotal(its), dueDate: dueFor(ym, dueDay), notes } });
      changed++;
    }
  }
  void updated;
  revalidatePath('/', 'layout');
  return { ok: true, message: changed ? `Cobrança atualizada e ${changed} fatura(s) em aberto ajustadas.` : 'Cobrança atualizada. Vale para as próximas faturas.' };
}
