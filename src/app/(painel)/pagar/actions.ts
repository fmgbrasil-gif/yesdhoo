'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str, localDate } from '@/lib/util';
import { parseMoney } from '@/lib/money';
import { randomToken } from '@/lib/crypto';
import { addMonths } from '@/lib/billing';
import { generatePayables } from '@/lib/payables';
import type { ActionResult } from '@/components/ui';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const done = (message?: string): ActionResult => { revalidatePath('/', 'layout'); return { ok: true, message }; };
/** Mesmo dia nos meses seguintes (dia 31 vira o ultimo dia do mes). */
const sameDay = (iso: string, n: number) => {
  const ym = addMonths(iso.slice(0, 7), n);
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  return `${ym}-${String(Math.min(Number(iso.slice(8, 10)), last)).padStart(2, '0')}`;
};

/** Nova conta a pagar (opcionalmente repetida por N meses) ou edicao de uma conta em aberto. */
export async function savePayable(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const description = str(fd, 'description')?.slice(0, 200);
  if (!description) return { error: 'Informe a descrição.' };
  const amountCents = parseMoney(str(fd, 'amount'));
  if (!amountCents || amountCents <= 0) return { error: 'Informe um valor maior que zero.' };
  const dueDate = str(fd, 'dueDate');
  if (!dueDate || !DATE.test(dueDate)) return { error: 'Informe o vencimento.' };
  const data = { description, amountCents, dueDate, supplier: str(fd, 'supplier')?.slice(0, 120) ?? null, category: str(fd, 'category')?.slice(0, 60) ?? 'Outros', notes: String(fd.get('notes') ?? '').slice(0, 1000) };
  const id = str(fd, 'id');
  if (id) {
    const p = await db.payable.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!p || p.status !== 'aberta') return { error: 'Só é possível editar contas em aberto.' };
    await db.payable.update({ where: { id }, data });
    return done('Conta atualizada.');
  }
  if (str(fd, 'repeat') === 'recorrente') {
    // despesa fixa mensal: 12 meses lancados a frente, mais um no ultimo dia de cada mes, ate cancelar
    const s = await db.payableSeries.create({ data: { tenantId: user.tenantId, description: data.description, supplier: data.supplier, category: data.category, amountCents: data.amountCents, notes: data.notes, dueDay: Number(dueDate.slice(8, 10)), startMonth: dueDate.slice(0, 7) } });
    const n = await generatePayables(s);
    return done(`Conta fixa mensal criada: ${n} meses lançados. Todo último dia do mês o sistema lança mais um.`);
  }
  const times = Math.min(60, Math.max(1, Number(str(fd, 'repeat') ?? 1) || 1));
  const groupId = times > 1 ? randomToken(12) : null;
  await db.payable.createMany({ data: Array.from({ length: times }, (_, i) => ({
    ...data, tenantId: user.tenantId, dueDate: sameDay(dueDate, i), groupId, installment: times > 1 ? i + 1 : null, installments: times > 1 ? times : null,
  })) });
  return done(times > 1 ? `${times} contas lançadas (uma por mês).` : 'Conta lançada.');
}

/** Paga a conta: sai da conta corrente escolhida e vai para o extrato. */
export async function payPayable(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = await db.payable.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!p || p.status !== 'aberta') return { error: 'Conta não encontrada ou já paga.' };
  const acc = await db.bankAccount.findFirst({ where: { id: String(fd.get('accountId') ?? ''), tenantId: user.tenantId } });
  if (!acc) return { error: 'Escolha de qual conta sai o pagamento. Cadastre suas contas em Caixa e contas.' };
  const paidCents = parseMoney(str(fd, 'paid')) ?? p.amountCents;
  if (paidCents <= 0) return { error: 'Valor pago inválido.' };
  const paidAt = str(fd, 'paidAt') ?? localDate();
  if (!DATE.test(paidAt)) return { error: 'Data inválida.' };
  await db.$transaction([
    db.payable.update({ where: { id: p.id }, data: { status: 'paga', paidAt, paidCents, accountId: acc.id } }),
    db.cashEntry.create({ data: { tenantId: user.tenantId, accountId: acc.id, kind: 'saida', amountCents: paidCents, date: paidAt, category: p.category, payableId: p.id,
      description: `${p.description}${p.supplier ? ` — ${p.supplier}` : ''}${p.installments ? ` (${p.installment}/${p.installments})` : ''}` } }),
  ]);
  return done('Pagamento registrado.');
}

/** Estorna o pagamento: a conta volta a ficar em aberto e o lancamento sai do extrato. */
export async function unpayPayable(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = await db.payable.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId, status: 'paga' } });
  if (!p) return { error: 'Só é possível estornar uma conta paga.' };
  await db.$transaction([
    db.cashEntry.deleteMany({ where: { payableId: p.id } }),
    db.payable.update({ where: { id: p.id }, data: { status: 'aberta', paidAt: null, paidCents: null, accountId: null } }),
  ]);
  return done('Pagamento estornado.');
}

/** Cancela (ou reativa) a conta; opcionalmente as proximas da mesma serie mensal. */
export async function cancelPayable(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = await db.payable.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!p) return { error: 'Conta não encontrada.' };
  if (fd.get('reactivate') === '1') {
    if (p.status !== 'cancelada') return { error: 'A conta não está cancelada.' };
    await db.payable.update({ where: { id: p.id }, data: { status: 'aberta' } });
    return done('Conta reativada.');
  }
  if (p.status !== 'aberta') return { error: 'Só é possível cancelar contas em aberto.' };
  const r = await db.payable.updateMany({
    where: fd.get('series') === 'on' && p.groupId ? { tenantId: user.tenantId, groupId: p.groupId, status: 'aberta', dueDate: { gte: p.dueDate } } : { id: p.id },
    data: { status: 'cancelada' },
  });
  return done(r.count > 1 ? `${r.count} contas canceladas.` : 'Conta cancelada.');
}

/** Cancela a despesa fixa mensal e todas as contas futuras em aberto dela. */
export async function cancelPayableSeries(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const s = await db.payableSeries.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId, status: 'ativa' } });
  if (!s) return { error: 'Recorrência não encontrada ou já cancelada.' };
  await db.payableSeries.update({ where: { id: s.id }, data: { status: 'cancelada', cancelledAt: new Date() } });
  const r = await db.payable.updateMany({ where: { seriesId: s.id, status: 'aberta', dueDate: { gte: localDate() } }, data: { status: 'cancelada' } });
  return done(`Recorrência cancelada${r.count ? ` e ${r.count} conta(s) futura(s) canceladas` : ''}.`);
}

/** Altera valor, descricao, fornecedor ou categoria da despesa fixa; vale para as contas futuras em aberto. */
export async function updatePayableSeries(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const s = await db.payableSeries.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId, status: 'ativa' } });
  if (!s) return { error: 'Recorrência não encontrada ou cancelada.' };
  const description = str(fd, 'description')?.slice(0, 200);
  const amountCents = parseMoney(str(fd, 'amount'));
  if (!description || !amountCents || amountCents <= 0) return { error: 'Informe descrição e valor.' };
  const data = { description, amountCents, supplier: str(fd, 'supplier')?.slice(0, 120) ?? null, category: str(fd, 'category')?.slice(0, 60) ?? 'Outros' };
  await db.payableSeries.update({ where: { id: s.id }, data });
  const r = await db.payable.updateMany({ where: { seriesId: s.id, status: 'aberta', dueDate: { gte: localDate() } }, data });
  return done(`Recorrência atualizada (${r.count} conta(s) futura(s) ajustadas).`);
}
