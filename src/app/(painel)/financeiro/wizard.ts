'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { chargeFromForm, contractFromForm } from '@/lib/charges';
import { invoiceLink } from '@/lib/billing';
import { contractFileName, invoiceFileName, pixFileName } from '@/lib/doc-names';
import { fileUrl } from '@/lib/storage';

type Fail = { ok: false; error: string };

/** Etapa 1: cria a cobranca e devolve a primeira fatura. */
export async function wizardCharge(fd: FormData): Promise<Fail | { ok: true; invoiceId: string | null; subscriptionId: string | null; clientId: string; message: string }> {
  const user = await requireAdmin();
  const r = await chargeFromForm(user, fd);
  if ('error' in r) return { ok: false, error: r.error };
  revalidatePath('/financeiro');
  return { ok: true, ...r };
}

/** Etapa 2: redige o contrato com IA. */
export async function wizardContract(fd: FormData): Promise<Fail | { ok: true; contractId: string; title: string; body: string; fileName: string; logo: string | null }> {
  const user = await requireAdmin();
  const r = await contractFromForm(user, fd);
  if ('error' in r) return { ok: false, error: r.error };
  const client = await db.client.findUniqueOrThrow({ where: { id: r.contract.clientId } });
  return { ok: true, contractId: r.contract.id, title: r.contract.title, body: r.contract.body, fileName: contractFileName(client), logo: fileUrl(user.tenant.logo) };
}

/** Etapa 4: enderecos e nomes dos arquivos da fatura e do Pix. */
export async function wizardDocs(invoiceId: string): Promise<Fail | { ok: true; invoiceUrl: string; pixUrl: string; invoiceFile: string; pixFile: string }> {
  const user = await requireAdmin();
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: user.tenantId }, include: { client: true } });
  if (!inv) return { ok: false, error: 'Fatura não encontrada.' };
  const url = invoiceLink(inv);
  return { ok: true, invoiceUrl: url, pixUrl: `${url}/pix`, invoiceFile: invoiceFileName(inv, inv.client), pixFile: pixFileName(inv, inv.client) };
}
