'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import type { ActionResult } from '@/components/ui';

export type OperationOpt = { id: string; name: string; screenIds: string[]; accountId?: string | null };

/** Cria ou edita uma operacao (nome + pontos/telas que ela contempla). Usado pela pagina e pelo assistente de cobranca. */
export async function upsertOperation(fd: FormData): Promise<{ ok: false; error: string } | { ok: true; operation: OperationOpt }> {
  const user = await requireAdmin();
  const name = str(fd, 'name')?.slice(0, 80);
  if (!name) return { ok: false, error: 'Dê um nome para a operação.' };
  const wanted = fd.getAll('screenIds').map(String);
  const screens = await db.screen.findMany({ where: { tenantId: user.tenantId, id: { in: wanted } }, select: { id: true } });
  if (!screens.length) return { ok: false, error: 'Marque ao menos um ponto (tela) da operação.' };
  const id = str(fd, 'id');
  const accId = str(fd, 'accountId');
  const account = accId ? await db.bankAccount.findFirst({ where: { id: accId, tenantId: user.tenantId } }) : null;
  const data = { name, description: String(fd.get('description') ?? '').slice(0, 500), ...(fd.has('accountId') ? { accountId: account?.id ?? null } : {}) };
  const set = screens.map((s) => ({ id: s.id }));
  let op;
  if (id) {
    const cur = await db.operation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!cur) return { ok: false, error: 'Operação não encontrada.' };
    op = await db.operation.update({ where: { id }, data: { ...data, screens: { set } } });
  } else {
    if (await db.operation.findFirst({ where: { tenantId: user.tenantId, name } })) return { ok: false, error: 'Já existe uma operação com esse nome.' };
    op = await db.operation.create({ data: { ...data, tenantId: user.tenantId, screens: { connect: set } } });
  }
  revalidatePath('/operacoes');
  return { ok: true, operation: { id: op.id, name: op.name, screenIds: set.map((s) => s.id) } };
}

export async function saveOperation(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await upsertOperation(fd);
  return r.ok ? { ok: true } : { error: r.error };
}

export async function deleteOperation(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  await db.operation.deleteMany({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  revalidatePath('/operacoes');
  return { ok: true };
}
