'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { localDate, str } from '@/lib/util';
import { chargeFromForm, readAttachments } from '@/lib/charges';
import { competenceLabel, generateFirstPending, invoiceLink } from '@/lib/billing';
import { contractFileName, invoiceFileName, pixFileName } from '@/lib/doc-names';
import { fileUrl } from '@/lib/storage';
import { randomToken } from '@/lib/crypto';
import { fmtDate, fmtMoney } from '@/lib/money';

import { readClientDocs, type ClientDraft } from '@/lib/ai-client';
import { basicContract } from '@/lib/contract-template';
import { parseKind } from '@/lib/client-kind';

type Fail = { ok: false; error: string };
export type WizardClient = { id: string; name: string; kind: string };

/** Etapa 1a: le os documentos (cartao CNPJ, contrato social, comprovantes) e devolve o cadastro sugerido. */
export async function wizardReadDocs(fd: FormData): Promise<Fail | { ok: true; draft: ClientDraft; notes: string[] }> {
  const user = await requireAdmin();
  const files = await readAttachments(fd, 'docs');
  if (typeof files === 'string') return { ok: false, error: files };
  if (!files.length) return { ok: false, error: 'Escolha ao menos um documento (PDF ou imagem).' };
  try {
    return { ok: true, ...(await readClientDocs(user.tenant, files)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível ler os documentos.' };
  }
}

/** Etapa 1b: grava o cliente (novo ou existente atualizado) e segue para a cobranca. */
export async function wizardSaveClient(fd: FormData): Promise<Fail | { ok: true; client: WizardClient }> {
  const user = await requireAdmin();
  const name = str(fd, 'name');
  if (!name) return { ok: false, error: 'Informe o nome ou a razão social do cliente.' };
  const document = str(fd, 'document')?.replace(/\D/g, '') || null;
  const data = {
    kind: parseKind(fd.get('kind')), type: fd.get('type') === 'PF' ? 'PF' : 'PJ', name,
    tradeName: str(fd, 'tradeName'), document, stateRegistration: str(fd, 'stateRegistration'), email: str(fd, 'email'), phone1: str(fd, 'phone1'),
    road: str(fd, 'road'), number: str(fd, 'number'), complement: str(fd, 'complement'), neighborhood: str(fd, 'neighborhood'),
    zipcode: str(fd, 'zipcode'), city: str(fd, 'city'), state: str(fd, 'state'),
  };
  // mesmo CPF/CNPJ ja cadastrado: atualiza em vez de duplicar
  const same = document ? await db.client.findFirst({ where: { tenantId: user.tenantId, document } }) : null;
  const c = same ? await db.client.update({ where: { id: same.id }, data: { ...data, active: true } }) : await db.client.create({ data: { ...data, tenantId: user.tenantId } });
  revalidatePath('/clientes');
  return { ok: true, client: { id: c.id, name: c.tradeName || c.name, kind: c.kind } };
}

/** Etapa 2: cria a cobranca (avulsa ja cria a fatura). */
export async function wizardCharge(fd: FormData): Promise<Fail | { ok: true; invoiceId: string | null; subscriptionId: string | null; clientId: string; message: string }> {
  const user = await requireAdmin();
  const r = await chargeFromForm(user, fd);
  if ('error' in r) return { ok: false, error: r.error };
  revalidatePath('/financeiro');
  return { ok: true, ...r };
}

/** Etapa 3: contrato basico no padrao da empresa, com os pontos da operacao escolhida. */
export async function wizardContract(fd: FormData): Promise<Fail | { ok: true; contractId: string; title: string; body: string; fileName: string; logo: string | null; publicUrl: string }> {
  const user = await requireAdmin();
  const client = await db.client.findFirst({ where: { id: String(fd.get('clientId')), tenantId: user.tenantId } });
  if (!client) return { ok: false, error: 'Cliente não encontrado.' };
  const op = await db.operation.findFirst({ where: { id: String(fd.get('operationId') ?? ''), tenantId: user.tenantId }, include: { screens: { orderBy: { name: 'asc' } } } });
  if (!op) return { ok: false, error: 'Escolha a operação do contrato.' };
  const subId = str(fd, 'subscriptionId');
  const sub = subId ? await db.subscription.findFirst({ where: { id: subId, tenantId: user.tenantId, clientId: client.id } }) : null;
  const invId = str(fd, 'invoiceId');
  const inv = !sub && invId ? await db.invoice.findFirst({ where: { id: invId, tenantId: user.tenantId, clientId: client.id } }) : null;
  if (!sub && !inv) return { ok: false, error: 'Cobrança não encontrada.' };
  const charge = sub
    ? { mode: sub.mode, amountCents: sub.amountCents, dueDay: sub.dueDay, startMonth: sub.startMonth, months: sub.months }
    : { mode: 'avulsa', amountCents: inv!.amountCents, dueDate: inv!.dueDate };
  const body = basicContract(user.tenant, client, charge, op, localDate());
  const title = `Contrato — ${client.tradeName || client.name} — ${op.name}`;
  const contract = await db.contract.create({ data: { tenantId: user.tenantId, clientId: client.id, subscriptionId: sub?.id ?? null, operationId: op.id, title, body, publicToken: randomToken(18) } });
  if (sub) {
    await db.subscription.update({ where: { id: sub.id }, data: { operationId: op.id } });
    await db.invoice.updateMany({ where: { subscriptionId: sub.id, operationId: null }, data: { operationId: op.id } });
  } else if (inv) await db.invoice.update({ where: { id: inv.id }, data: { operationId: op.id } });
  revalidatePath('/financeiro');
  return { ok: true, contractId: contract.id, title, body, fileName: contractFileName(client), logo: fileUrl(user.tenant.logo), publicUrl: `/contrato/${contract.publicToken}` };
}

/** Etapa 4: botao "Gerar fatura" — gera ja a primeira fatura da cobranca (com o Pix). */
export async function wizardInvoice(subscriptionId: string): Promise<Fail | { ok: true; invoiceId: string }> {
  const user = await requireAdmin();
  const sub = await db.subscription.findFirst({ where: { id: subscriptionId, tenantId: user.tenantId, status: 'ativa' } });
  if (!sub) return { ok: false, error: 'Cobrança não encontrada ou cancelada.' };
  const inv = await generateFirstPending(sub);
  revalidatePath('/financeiro');
  return { ok: true, invoiceId: inv.id };
}

export type WizardDocs = {
  ok: true; invoiceUrl: string; pixUrl: string; payUrl: string; invoiceFile: string; pixFile: string;
  number: number; amount: string; due: string; ref: string; clientName: string; email: string | null; phone: string | null; company: string;
};

/** Etapas 4 e 5: enderecos, nomes dos arquivos e dados para as mensagens de envio. */
export async function wizardDocs(invoiceId: string): Promise<Fail | WizardDocs> {
  const user = await requireAdmin();
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: user.tenantId }, include: { client: true } });
  if (!inv) return { ok: false, error: 'Fatura não encontrada.' };
  const url = invoiceLink(inv);
  const digits = (inv.client.phone1 ?? '').replace(/\D/g, '');
  return {
    ok: true, invoiceUrl: url, pixUrl: `${url}/pix`, payUrl: `${url}/pagar`, invoiceFile: invoiceFileName(inv, inv.client), pixFile: pixFileName(inv, inv.client),
    number: inv.number, amount: fmtMoney(inv.amountCents), due: fmtDate(inv.dueDate), ref: inv.competence ? competenceLabel(inv.competence) : `vencimento ${fmtDate(inv.dueDate)}`,
    clientName: inv.client.tradeName || inv.client.name, email: inv.client.email,
    phone: digits.length >= 10 ? (digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`) : null,
    company: user.tenant.tradeName || user.tenant.name,
  };
}
