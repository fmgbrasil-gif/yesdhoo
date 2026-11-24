'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { cancelSubscription } from '@/lib/billing';
import type { ActionResult } from '@/components/ui';
import { parseKind } from '@/lib/client-kind';

export async function saveClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = str(fd, 'id');
  const current = id ? await db.client.findFirst({ where: { id, tenantId: user.tenantId } }) : null;
  if (id && !current) return { error: 'Cliente não encontrado.' };
  // cliente novo so pelo Financeiro (Nova cobranca): cadastro + cobranca + contrato
  // cortesia (anuncia sem pagar) pode ser cadastrada direto aqui, sem cobranca nem contrato
  if (!id && fd.get('kind') !== 'cortesia') return { error: 'Cadastre clientes novos pelo Financeiro → Nova cobrança, junto com a cobrança e o contrato.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Informe o nome do cliente.' };
  let image = current?.image ?? null;
  if (isUpload(fd.get('image'))) { await removeFile(image); image = await saveFile(fd.get('image') as File, 'clientes'); }
  const data = {
    kind: parseKind(fd.get('kind')),
    name, image, type: fd.get('type') === 'PF' ? 'PF' : 'PJ', tradeName: str(fd, 'tradeName'), stateRegistration: str(fd, 'stateRegistration'), document: str(fd, 'document')?.replace(/\D/g, '') ?? null, email: str(fd, 'email'),
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

/**
 * Desativa ou reativa o cadastro. Desativado, os conteudos dele saem do ar em todas as telas na proxima
 * sincronizacao (sem apagar nada das playlists); reativado, voltam a tocar.
 */
export async function toggleClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const c = await db.client.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!c) return { error: 'Cadastro não encontrado.' };
  if (await db.tenant.count({ where: { billingClientId: c.id } })) return { error: 'Este cadastro representa uma empresa da plataforma. Para suspendê-la, use Empresas clientes.' };
  const active = !c.active;
  await db.client.update({ where: { id: c.id }, data: { active, deactivatedAt: active ? null : new Date() } });
  let cancelled = 0;
  if (!active && fd.get('cancelCharges') === 'on') {
    for (const sub of await db.subscription.findMany({ where: { clientId: c.id, status: 'ativa' } })) {
      cancelled += await cancelSubscription(sub, { reason: 'Cliente desativado', cancelOpen: true });
    }
  }
  // as telas que exibem conteudos deste cliente sincronizam de novo
  await db.screen.updateMany({
    where: { tenantId: user.tenantId, items: { some: { OR: [{ media: { clientId: c.id } }, { group: { medias: { some: { media: { clientId: c.id } } } } }] } } },
    data: { playlistVersion: { increment: 1 } },
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: active ? `${c.name} reativado. Os conteúdos voltam às telas em até 1 minuto.` : `${c.name} desativado. Os conteúdos saem das telas em até 1 minuto.${cancelled ? ` ${cancelled} fatura(s) futura(s) canceladas.` : ''}` };
}
