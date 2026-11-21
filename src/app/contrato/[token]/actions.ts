'use server';

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

type Result = { ok: true } | { ok: false; error: string };

const findPending = async (token: string) => {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  return db.contract.findUnique({ where: { publicToken: token } });
};
const ipOf = (h: Headers) => (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || null;
const hashBody = async (body: string) => crypto.createHash('sha256').update(body, 'utf8').digest('hex');

/** Cliente assina o contrato pelo link: nome, CPF/CNPJ, rubrica desenhada e aceite. Registra data, IP e o hash do texto. */
export async function signContract(token: string, fd: FormData): Promise<Result> {
  const c = await findPending(token);
  if (!c) return { ok: false, error: 'Contrato não encontrado.' };
  if (c.signStatus !== 'pendente') return { ok: false, error: c.signStatus === 'assinado' ? 'Este contrato já foi assinado.' : 'Este contrato foi recusado.' };
  const name = String(fd.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const doc = String(fd.get('doc') ?? '').replace(/\D/g, '');
  const signature = String(fd.get('signature') ?? '');
  if (name.split(' ').length < 2) return { ok: false, error: 'Informe seu nome completo.' };
  if (doc.length !== 11 && doc.length !== 14) return { ok: false, error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 1500) return { ok: false, error: 'Desenhe sua rubrica no campo de assinatura.' };
  if (signature.length > 400_000) return { ok: false, error: 'A rubrica ficou grande demais. Limpe e desenhe de novo.' };
  if (fd.get('accept') !== 'on') return { ok: false, error: 'Marque que leu e concorda com o contrato.' };
  const h = await headers();
  // so assina se continuar pendente (evita duas assinaturas ao mesmo tempo)
  const r = await db.contract.updateMany({
    where: { id: c.id, signStatus: 'pendente' },
    data: { signStatus: 'assinado', signedAt: new Date(), signerName: name, signerDoc: doc, signature, signerIp: ipOf(h), signerAgent: (h.get('user-agent') ?? '').slice(0, 300), bodyHash: await hashBody(c.body) },
  });
  if (!r.count) return { ok: false, error: 'Este contrato já foi respondido.' };
  await db.notification.create({ data: { tenantId: c.tenantId, key: `contrato-assinado:${c.id}`, message: `${name} assinou o contrato "${c.title}".`, link: `/contratos/${c.id}` } }).catch(() => {});
  revalidatePath(`/contrato/${token}`);
  return { ok: true };
}

/** Cliente recusa o contrato pelo link (motivo opcional). */
export async function refuseContract(token: string, fd: FormData): Promise<Result> {
  const c = await findPending(token);
  if (!c) return { ok: false, error: 'Contrato não encontrado.' };
  if (c.signStatus !== 'pendente') return { ok: false, error: 'Este contrato já foi respondido.' };
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 1000) || null;
  const h = await headers();
  const r = await db.contract.updateMany({ where: { id: c.id, signStatus: 'pendente' }, data: { signStatus: 'recusado', refusedAt: new Date(), refuseReason: reason, signerIp: ipOf(h) } });
  if (!r.count) return { ok: false, error: 'Este contrato já foi respondido.' };
  await db.notification.create({ data: { tenantId: c.tenantId, key: `contrato-recusado:${c.id}`, message: `O contrato "${c.title}" foi recusado pelo cliente${reason ? `: ${reason.slice(0, 120)}` : '.'}`, link: `/contratos/${c.id}` } }).catch(() => {});
  revalidatePath(`/contrato/${token}`);
  return { ok: true };
}
