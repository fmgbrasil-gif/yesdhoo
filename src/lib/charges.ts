import 'server-only';
import type { SessionUser } from './auth';
import type { Contract } from '@prisma/client';
import { db } from './db';
import { str } from './util';
import { parseMoney } from './money';
import { isUpload } from './storage';
import { createInvoice, createSubscription, type InvoiceItem } from './billing';
import { ContractError, draftContract, type Attachment } from './ai-contract';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readItems(fd: FormData): InvoiceItem[] | string {
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

/** Cadastra no catalogo de servicos as descricoes novas usadas na cobranca (com unidade e valor), para escolher nas proximas. */
export async function rememberServices(tenantId: string, items: InvoiceItem[]) {
  const existing = await db.service.findMany({ where: { tenantId }, select: { name: true } });
  const known = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  for (const it of items) {
    const key = it.description.trim().toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    await db.service.create({ data: { tenantId, name: it.description.trim().slice(0, 120), unit: it.unit ?? 'un', priceCents: it.unitCents } });
  }
}

/** Anexos do formulario (campo "attachments"): PDF ou imagens, ate 5 arquivos e 4 MB no total (limite de envio do servidor). */
export async function readAttachments(fd: FormData, field = 'attachments'): Promise<Attachment[] | string> {
  const files = fd.getAll(field).filter(isUpload);
  const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (files.length > 5) return 'Anexe no máximo 5 arquivos.';
  if (files.reduce((a, f) => a + f.size, 0) > 4 * 1024 * 1024) return 'Os arquivos passam de 4 MB. Envie arquivos menores ou menos arquivos.';
  const bad = files.find((f) => !ALLOWED.includes(f.type));
  if (bad) return `“${bad.name}” não é PDF nem imagem (PNG, JPG, WEBP ou GIF).`;
  return Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type, data: Buffer.from(await f.arrayBuffer()).toString('base64') })));
}

type ChargeResult = { error: string } | { message: string; invoiceId: string | null; subscriptionId: string | null; clientId: string };

/** Valida o formulario e cria a cobranca. Devolve a primeira fatura gerada (para o fluxo de envio). */
export async function chargeFromForm(user: SessionUser, fd: FormData): Promise<ChargeResult> {
  const client = await db.client.findFirst({ where: { id: String(fd.get('clientId')), tenantId: user.tenantId } });
  if (!client) return { error: 'Escolha o cliente.' };
  if (!client.active) return { error: `${client.name} está desativado. Reative o cadastro antes de cobrar.` };
  const items = readItems(fd);
  if (typeof items === 'string') return { error: items };
  if (items.reduce((a, i) => a + i.quantity * i.unitCents, 0) <= 0) return { error: 'O total precisa ser maior que zero.' };
  const notes = str(fd, 'notes') ?? '';
  const mode = String(fd.get('mode'));
  const opId = str(fd, 'operationId');
  const operationId = opId && (await db.operation.findFirst({ where: { id: opId, tenantId: user.tenantId } })) ? opId : null;
  const accId = str(fd, 'accountId');
  const accountId = accId && (await db.bankAccount.findFirst({ where: { id: accId, tenantId: user.tenantId } })) ? accId : null;
  if (mode === 'avulsa') {
    const dueDate = str(fd, 'dueDate');
    if (!dueDate || !DATE.test(dueDate)) return { error: 'Informe a data de vencimento.' };
    await rememberServices(user.tenantId, items);
    const inv = await createInvoice(user.tenantId, { clientId: client.id, items, dueDate, notes, operationId, accountId });
    return { message: 'Fatura criada.', invoiceId: inv.id, subscriptionId: null, clientId: client.id };
  }
  if (mode !== 'periodo' && mode !== 'recorrente') return { error: 'Escolha o tipo de cobrança.' };
  const startMonth = str(fd, 'startMonth');
  if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) return { error: 'Informe o mês da primeira cobrança.' };
  const dueDay = Number(str(fd, 'dueDay'));
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return { error: 'O dia de vencimento deve ficar entre 1 e 28.' };
  const months = Number(str(fd, 'months'));
  if (mode === 'periodo' && (!Number.isInteger(months) || months < 2 || months > 60)) return { error: 'O período deve ter entre 2 e 60 meses.' };
  await rememberServices(user.tenantId, items);
  const sub = await createSubscription(user.tenantId, { clientId: client.id, mode, items, dueDay, startMonth, months: mode === 'periodo' ? months : undefined, notes, operationId, accountId });
  const first = await db.invoice.findFirst({ where: { subscriptionId: sub.id }, orderBy: { dueDate: 'asc' } });
  return {
    message: mode === 'periodo' ? `${months} faturas geradas.` : 'Cobrança recorrente criada. As faturas serão geradas todo mês automaticamente.',
    invoiceId: first?.id ?? null, subscriptionId: sub.id, clientId: client.id,
  };
}

/** Redige e grava o contrato com IA (dados das duas empresas, condicoes da cobranca e anexos). */
export async function contractFromForm(user: SessionUser, fd: FormData): Promise<{ error: string } | { contract: Contract }> {
  const client = await db.client.findFirst({ where: { id: String(fd.get('clientId')), tenantId: user.tenantId } });
  if (!client) return { error: 'Escolha o cliente.' };
  const subId = str(fd, 'subscriptionId');
  const sub = subId ? await db.subscription.findFirst({ where: { id: subId, tenantId: user.tenantId, clientId: client.id } }) : null;
  if (subId && !sub) return { error: 'Cobrança não encontrada para este cliente.' };
  const screens = (await db.screen.findMany({
    where: { tenantId: user.tenantId, OR: [{ clientId: client.id }, { items: { some: { media: { clientId: client.id } } } }] },
    select: { name: true, city: true, state: true }, orderBy: { name: 'asc' }, take: 30,
  })).map((s) => [s.name, s.city && `${s.city}${s.state ? '/' + s.state : ''}`].filter(Boolean).join(' — '));
  const att = await readAttachments(fd);
  if (typeof att === 'string') return { error: att };
  const attachments = att;
  let body: string;
  try {
    body = await draftContract(user.tenant, client, sub, String(fd.get('extra') ?? ''), screens, attachments);
  } catch (e) {
    if (e instanceof ContractError) return { error: e.message };
    throw e;
  }
  const title = `Contrato — ${client.name}${sub ? ` (${sub.mode === 'periodo' ? `${sub.months} meses` : 'recorrente'})` : ''}`;
  const contract = await db.contract.create({ data: { tenantId: user.tenantId, clientId: client.id, subscriptionId: sub?.id ?? null, title, body } });
  return { contract };
}
