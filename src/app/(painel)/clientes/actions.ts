'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { parseMoney } from '@/lib/money';
import type { ActionResult } from '@/components/ui';

export async function saveClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = str(fd, 'id');
  const current = id ? await db.client.findFirst({ where: { id, tenantId: user.tenantId } }) : null;
  if (id && !current) return { error: 'Cliente não encontrado.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Informe o nome do cliente.' };
  let image = current?.image ?? null;
  if (isUpload(fd.get('image'))) { await removeFile(image); image = await saveFile(fd.get('image') as File, 'clientes'); }
  const fee = str(fd, 'monthlyFee');
  const monthlyFeeCents = fee ? parseMoney(fee) : null;
  if (fee && monthlyFeeCents == null) return { error: 'Mensalidade inválida. Use o formato 1.500,00.' };
  const dueDay = Number(str(fd, 'dueDay')) || null;
  if (dueDay != null && (dueDay < 1 || dueDay > 28)) return { error: 'O dia de vencimento deve ficar entre 1 e 28.' };
  const data = {
    kind: fd.get('kind') === 'parceiro' ? 'parceiro' : 'cliente', monthlyFeeCents: monthlyFeeCents || null, dueDay: monthlyFeeCents ? dueDay ?? 10 : dueDay,
    name, image, type: fd.get('type') === 'PF' ? 'PF' : 'PJ', document: str(fd, 'document')?.replace(/\D/g, '') ?? null, email: str(fd, 'email'),
    phone1: str(fd, 'phone1'), phone2: str(fd, 'phone2'), road: str(fd, 'road'), number: str(fd, 'number'), complement: str(fd, 'complement'),
    neighborhood: str(fd, 'neighborhood'), zipcode: str(fd, 'zipcode'), city: str(fd, 'city'), state: str(fd, 'state'),
  };
  if (current) await db.client.update({ where: { id: current.id }, data });
  else await db.client.create({ data: { ...data, tenantId: user.tenantId } });
  revalidatePath('/clientes');
  return { ok: true };
}

export async function deleteClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const c = await db.client.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!c) return { error: 'Cliente não encontrado.' };
  if (await db.invoice.count({ where: { clientId: c.id } })) return { error: 'Este cadastro tem faturas. Cancele ou mantenha as faturas e deixe o cadastro como está.' };
  if (await db.tenant.count({ where: { billingClientId: c.id } })) return { error: 'Este cadastro representa uma empresa da plataforma e não pode ser excluído.' };
  await db.client.delete({ where: { id: c.id } }); // midias e telas ficam como "Avulso"
  await removeFile(c.image);
  revalidatePath('/clientes');
  return { ok: true };
}
