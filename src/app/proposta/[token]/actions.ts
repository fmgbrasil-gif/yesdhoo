'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };
const ipOf = (h: Headers) => (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || null;
const find = (token: string) => (/^[\w-]{20,40}$/.test(token) ? db.proposal.findUnique({ where: { publicToken: token } }) : null);

/** Cliente aceita a proposta pelo link: nome, CPF/CNPJ, rubrica e aceite. Cria (ou atualiza) o cadastro do cliente. */
export async function acceptProposal(token: string, fd: FormData): Promise<Result> {
  const p = await find(token);
  if (!p) return { ok: false, error: 'Proposta não encontrada.' };
  if (p.status === 'aceita' || p.status === 'recusada') return { ok: false, error: 'Esta proposta já foi respondida.' };
  if (p.validUntil && p.validUntil < new Date().toISOString().slice(0, 10)) return { ok: false, error: 'Esta proposta venceu. Peça uma proposta atualizada.' };
  const name = String(fd.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const doc = String(fd.get('doc') ?? '').replace(/\D/g, '');
  const signature = String(fd.get('signature') ?? '');
  if (name.split(' ').length < 2) return { ok: false, error: 'Informe seu nome completo.' };
  if (doc.length !== 11 && doc.length !== 14) return { ok: false, error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 1500) return { ok: false, error: 'Desenhe sua rubrica no campo de assinatura.' };
  if (signature.length > 400_000) return { ok: false, error: 'A rubrica ficou grande demais. Limpe e desenhe de novo.' };
  if (fd.get('accept') !== 'on') return { ok: false, error: 'Marque que leu e aceita a proposta.' };
  const h = await headers();
  const r = await db.proposal.updateMany({
    where: { id: p.id, status: { in: ['rascunho', 'enviada'] } },
    data: { status: 'aceita', acceptedAt: new Date(), signerName: name, signerDoc: doc, signature, signerIp: ipOf(h) },
  });
  if (!r.count) return { ok: false, error: 'Esta proposta já foi respondida.' };
  // cadastro do cliente: mesmo CNPJ/CPF atualiza, senao cria
  const document = p.document?.replace(/\D/g, '') || (doc.length === 14 ? doc : null);
  const same = p.clientId ? await db.client.findUnique({ where: { id: p.clientId } }) : document ? await db.client.findFirst({ where: { tenantId: p.tenantId, document } }) : null;
  const data = {
    name: p.companyName, tradeName: p.tradeName, document, type: document && document.length === 11 ? 'PF' : 'PJ', email: p.email, phone1: p.phone, city: p.city,
  };
  const client = same
    ? await db.client.update({ where: { id: same.id }, data: { ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)), active: true } })
    : await db.client.create({ data: { ...data, tenantId: p.tenantId, kind: 'cliente', image: p.logo } });
  await db.proposal.update({ where: { id: p.id }, data: { clientId: client.id } });
  await db.notification.create({ data: { tenantId: p.tenantId, key: `proposta-aceita:${p.id}`, message: `${name} aceitou a proposta nº ${p.number} (${p.tradeName || p.companyName}). Siga para a cobrança e o contrato.`, link: `/propostas/${p.id}` } }).catch(() => {});
  revalidatePath(`/proposta/${token}`);
  return { ok: true };
}

/** Cliente recusa a proposta (motivo opcional). */
export async function refuseProposal(token: string, fd: FormData): Promise<Result> {
  const p = await find(token);
  if (!p) return { ok: false, error: 'Proposta não encontrada.' };
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 1000) || null;
  const r = await db.proposal.updateMany({ where: { id: p.id, status: { in: ['rascunho', 'enviada'] } }, data: { status: 'recusada', refusedAt: new Date(), refuseReason: reason } });
  if (!r.count) return { ok: false, error: 'Esta proposta já foi respondida.' };
  await db.notification.create({ data: { tenantId: p.tenantId, key: `proposta-recusada:${p.id}`, message: `A proposta nº ${p.number} (${p.tradeName || p.companyName}) foi recusada${reason ? `: ${reason.slice(0, 120)}` : '.'}`, link: `/propostas/${p.id}` } }).catch(() => {});
  revalidatePath(`/proposta/${token}`);
  return { ok: true };
}
