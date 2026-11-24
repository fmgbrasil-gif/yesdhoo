'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import { parseMoney } from '@/lib/money';
import { BankError } from '@/lib/bank/asaas';
import { cancelBoleto, cancelSubscription, competenceLabel, dueFor, issueBoleto, itemsTotal, markPaid, METHODS, syncBoleto } from '@/lib/billing';
import { localDate } from '@/lib/util';
import { chargeFromForm, contractFromForm, readItems, rememberServices } from '@/lib/charges';
import { afterPlatformInvoiceChange } from '@/lib/tenant';
import type { ActionResult } from '@/components/ui';
import { basicContract } from '@/lib/contract-template';
import { randomToken } from '@/lib/crypto';
import { removeInvoicePayment } from '@/lib/cash';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function ownInvoice(tenantId: string, id: string) {
  return db.invoice.findFirst({ where: { id, tenantId }, include: { client: true } });
}


/** Nova cobranca: avulsa (uma fatura), por periodo (N meses, todas as faturas de uma vez) ou recorrente (todo mes ate cancelar). */
export async function saveCharge(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const r = await chargeFromForm(user, fd);
  if ('error' in r) return { error: r.error };
  revalidatePath('/financeiro');
  return { ok: true, message: r.message };
}

export async function cancelCharge(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const sub = await db.subscription.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId, status: 'ativa' } });
  if (!sub) return { error: 'Cobrança não encontrada ou já cancelada.' };
  const n = await cancelSubscription(sub, { reason: str(fd, 'reason') }); // cancela todas as faturas futuras em aberto
  revalidatePath('/', 'layout');
  return { ok: true, message: n ? `Recorrência cancelada e ${n} fatura(s) futura(s) canceladas.` : 'Recorrência cancelada. Nenhuma fatura nova será gerada.' };
}

/** Gera o contrato com IA e abre a pagina dele para revisar. */
export async function generateContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const r = await contractFromForm(user, fd);
  if ('error' in r) return { error: r.error };
  redirect(`/contratos/${r.contract.id}`);
}

export async function saveContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const c = await db.contract.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!c) return { error: 'Contrato não encontrado.' };
  if (c.signStatus === 'assinado') return { error: 'Contrato já assinado pelo cliente: o texto não pode mais ser alterado.' };
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
  await markPaid(inv, { paidCents, method: METHODS[method] ? method : undefined, paidAt: paidAt && DATE.test(paidAt) ? new Date(`${paidAt}T12:00:00`) : new Date(), accountId: str(fd, 'accountId') });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function reopenInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv || inv.status !== 'paga') return { error: 'Só é possível estornar uma fatura paga.' };
  await db.invoice.update({ where: { id: inv.id }, data: { status: 'aberta', paidAt: null, paidCents: null, paymentMethod: null } });
  await removeInvoicePayment(inv.id); // tira a entrada do caixa
  await afterPlatformInvoiceChange(inv.clientId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Tira a fatura do arquivo morto: volta a ficar em aberto (o boleto cancelado no banco nao volta; emita outro). */
export async function reactivateInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.tenantId, String(fd.get('id')));
  if (!inv || inv.status !== 'cancelada') return { error: 'Só é possível reativar uma fatura cancelada.' };
  await db.invoice.update({ where: { id: inv.id }, data: { status: 'aberta', bankChargeId: null, boletoUrl: null, boletoLine: null, bankPixPayload: null } });
  await afterPlatformInvoiceChange(inv.clientId);
  revalidatePath('/', 'layout');
  return { ok: true, message: `Fatura ${inv.number} reativada.` };
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


/** Operacao e caixa vindos do formulario (so os da propria empresa). */
async function opAndAccount(tenantId: string, fd: FormData) {
  const out: { operationId?: string | null; accountId?: string | null } = {};
  if (fd.has('operationId')) { const id = str(fd, 'operationId'); out.operationId = id && (await db.operation.findFirst({ where: { id, tenantId } })) ? id : null; }
  if (fd.has('accountId')) { const id = str(fd, 'accountId'); out.accountId = id && (await db.bankAccount.findFirst({ where: { id, tenantId } })) ? id : null; }
  return out;
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
  await db.invoice.update({ where: { id: inv.id }, data: { items: JSON.stringify(items), amountCents: itemsTotal(items), dueDate, notes: str(fd, 'notes') ?? '', ...(await opAndAccount(user.tenantId, fd)) } });
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
  await rememberServices(user.tenantId, items);
  const oa = await opAndAccount(user.tenantId, fd);
  const updated = await db.subscription.update({ where: { id: sub.id }, data: { items: JSON.stringify(items), amountCents: itemsTotal(items), dueDay, notes, ...oa } });
  let changed = 0;
  if (fd.get('applyOpen') === 'on') {
    const open = await db.invoice.findMany({ where: { subscriptionId: sub.id, status: 'aberta', bankChargeId: null, dueDate: { gte: localDate() } } });
    for (const inv of open) {
      const ym = inv.competence!;
      const tag = sub.mode === 'periodo' ? ` — parcela ${inv.installment}/${sub.months} (${competenceLabel(ym)})` : ` — ${competenceLabel(ym)}`;
      const its = items.map((it) => ({ ...it, description: it.description + tag }));
      await db.invoice.update({ where: { id: inv.id }, data: { items: JSON.stringify(its), amountCents: itemsTotal(its), dueDate: dueFor(ym, dueDay), notes, ...oa } });
      changed++;
    }
  }
  void updated;
  revalidatePath('/', 'layout');
  return { ok: true, message: changed ? `Cobrança atualizada e ${changed} fatura(s) em aberto ajustadas.` : 'Cobrança atualizada. Vale para as próximas faturas.' };
}

/** Refaz o texto de um contrato da operacao com o modelo padrao atual (pontos e dados atualizados). */
export async function refreshContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const c = await db.contract.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId }, include: { client: true, subscription: true, operation: { include: { screens: { orderBy: { name: 'asc' } } } } } });
  if (!c || !c.operation) return { error: 'Este contrato não é de uma operação; não dá para refazer pelo modelo.' };
  if (c.signStatus === 'assinado') return { error: 'Contrato já assinado pelo cliente: o texto não pode mais ser alterado.' };
  const sub = c.subscription;
  const cortesia = !sub && c.client.kind === 'cortesia';
  const inv = sub || cortesia ? null : await db.invoice.findFirst({ where: { clientId: c.clientId, tenantId: user.tenantId, status: { not: 'cancelada' } }, orderBy: { createdAt: 'desc' } });
  if (!sub && !inv && !cortesia) return { error: 'Não encontrei a cobrança deste contrato.' };
  const charge = cortesia
    ? { mode: 'cortesia', amountCents: 0 }
    : sub
    ? { mode: sub.mode, amountCents: sub.amountCents, dueDay: sub.dueDay, startMonth: sub.startMonth, months: sub.months }
    : { mode: 'avulsa', amountCents: inv!.amountCents, dueDate: inv!.dueDate };
  const body = basicContract(user.tenant, c.client, charge, c.operation, c.createdAt.toISOString().slice(0, 10));
  await db.contract.update({ where: { id: c.id }, data: { body } });
  revalidatePath(`/contratos/${c.id}`);
  return { ok: true, message: 'Contrato refeito com o modelo atual.' };
}

/** Cria o link para o cliente ler e assinar (contratos antigos, gerados antes da assinatura eletronica). */
export async function shareContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const c = await db.contract.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!c) return { error: 'Contrato não encontrado.' };
  if (!c.publicToken) await db.contract.update({ where: { id: c.id }, data: { publicToken: randomToken(18) } });
  revalidatePath(`/contratos/${c.id}`);
  return { ok: true };
}

/** Recusado pelo cliente: volta para "aguardando assinatura" depois de ajustar o texto. */
export async function reopenContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const r = await db.contract.updateMany({ where: { id: String(fd.get('id')), tenantId: user.tenantId, signStatus: 'recusado' }, data: { signStatus: 'pendente', refusedAt: null, refuseReason: null } });
  if (!r.count) return { error: 'Só contratos recusados podem ser reenviados.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Contrato liberado para assinatura de novo.' };
}
