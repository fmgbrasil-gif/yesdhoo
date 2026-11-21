'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str, localDate } from '@/lib/util';
import { parseMoney } from '@/lib/money';
import { randomToken } from '@/lib/crypto';
import { ACCOUNT_KINDS } from '@/lib/cash';
import type { ActionResult } from '@/components/ui';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const done = (message?: string): ActionResult => { revalidatePath('/', 'layout'); return { ok: true, message }; };

export async function saveAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const name = str(fd, 'name')?.slice(0, 60);
  if (!name) return { error: 'Dê um nome para a conta.' };
  const initialCents = parseMoney(str(fd, 'initial') ?? '0') ?? NaN;
  if (!Number.isFinite(initialCents)) return { error: 'Saldo inicial inválido. Use o formato 1.500,00.' };
  const kind = ACCOUNT_KINDS[String(fd.get('kind'))] ? String(fd.get('kind')) : 'banco';
  const isDefault = fd.get('isDefault') === 'on';
  const data = { name, kind, bank: str(fd, 'bank')?.slice(0, 120) ?? null, initialCents, isDefault, active: fd.get('inactive') !== 'on' };
  const id = str(fd, 'id');
  if (id && !(await db.bankAccount.findFirst({ where: { id, tenantId: user.tenantId } }))) return { error: 'Conta não encontrada.' };
  if (isDefault) await db.bankAccount.updateMany({ where: { tenantId: user.tenantId }, data: { isDefault: false } });
  const first = !(await db.bankAccount.count({ where: { tenantId: user.tenantId } }));
  if (id) await db.bankAccount.update({ where: { id }, data });
  else await db.bankAccount.create({ data: { ...data, isDefault: isDefault || first, tenantId: user.tenantId } });
  return done(id ? 'Conta atualizada.' : 'Conta criada.');
}

export async function deleteAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const acc = await db.bankAccount.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId }, include: { _count: { select: { entries: true } } } });
  if (!acc) return { error: 'Conta não encontrada.' };
  if (acc._count.entries) return { error: 'A conta tem lançamentos. Desative-a em vez de excluir, para manter o histórico.' };
  await db.bankAccount.delete({ where: { id: acc.id } });
  return done();
}

/** Lancamento manual: entrada ou saida numa conta. */
export async function saveEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const acc = await db.bankAccount.findFirst({ where: { id: String(fd.get('accountId')), tenantId: user.tenantId } });
  if (!acc) return { error: 'Escolha a conta.' };
  const kind = fd.get('kind') === 'saida' ? 'saida' : 'entrada';
  const amountCents = parseMoney(str(fd, 'amount'));
  if (!amountCents || amountCents <= 0) return { error: 'Informe um valor maior que zero.' };
  const description = str(fd, 'description')?.slice(0, 200);
  if (!description) return { error: 'Informe a descrição.' };
  const date = str(fd, 'date') ?? localDate();
  if (!DATE.test(date)) return { error: 'Data inválida.' };
  await db.cashEntry.create({ data: { tenantId: user.tenantId, accountId: acc.id, kind, amountCents, description, category: str(fd, 'category')?.slice(0, 60) ?? '', date } });
  return done(kind === 'entrada' ? 'Entrada lançada.' : 'Saída lançada.');
}

/** Transferencia entre contas: saida numa, entrada na outra (ligadas pelo transferId). */
export async function transfer(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const [from, to] = await Promise.all(['from', 'to'].map((k) => db.bankAccount.findFirst({ where: { id: String(fd.get(k)), tenantId: user.tenantId } })));
  if (!from || !to) return { error: 'Escolha as duas contas.' };
  if (from.id === to.id) return { error: 'Escolha contas diferentes.' };
  const amountCents = parseMoney(str(fd, 'amount'));
  if (!amountCents || amountCents <= 0) return { error: 'Informe um valor maior que zero.' };
  const date = str(fd, 'date') ?? localDate();
  if (!DATE.test(date)) return { error: 'Data inválida.' };
  const transferId = randomToken(12);
  const note = str(fd, 'description');
  await db.cashEntry.createMany({ data: [
    { tenantId: user.tenantId, accountId: from.id, kind: 'saida', amountCents, date, transferId, category: 'Transferência', description: `Transferência para ${to.name}${note ? ` — ${note}` : ''}` },
    { tenantId: user.tenantId, accountId: to.id, kind: 'entrada', amountCents, date, transferId, category: 'Transferência', description: `Transferência de ${from.name}${note ? ` — ${note}` : ''}` },
  ] });
  return done('Transferência lançada.');
}

/** Exclui um lancamento manual (ou as duas pontas de uma transferencia). Os automaticos sao desfeitos pela origem. */
export async function deleteEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const e = await db.cashEntry.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!e) return { error: 'Lançamento não encontrado.' };
  if (e.invoiceId) return { error: 'Este lançamento veio de uma fatura recebida: desfaça o pagamento da fatura no Financeiro.' };
  if (e.payableId) return { error: 'Este lançamento veio de uma conta paga: estorne o pagamento em Contas a pagar.' };
  await db.cashEntry.deleteMany({ where: e.transferId ? { transferId: e.transferId, tenantId: user.tenantId } : { id: e.id } });
  return done();
}
