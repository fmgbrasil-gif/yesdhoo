'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { folderConfig } from '@/lib/folder';
import { parseMoney } from '@/lib/money';
import { nextProposalNumber } from '@/lib/proposal';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { randomToken } from '@/lib/crypto';
import type { ActionResult } from '@/components/ui';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const opt = (fd: FormData, k: string) => s(fd, k) || null;
const int = (fd: FormData, k: string) => { const n = Number(s(fd, k).replace(/\D/g, '')); return Number.isFinite(n) && s(fd, k) ? n : null; };

/** Cria ou edita a proposta (enquanto nao foi aceita). */
export async function saveProposal(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = s(fd, 'id');
  const current = id ? await db.proposal.findFirst({ where: { id, tenantId: user.tenantId } }) : null;
  if (id && !current) return { error: 'Proposta não encontrada.' };
  if (current?.status === 'aceita') return { error: 'Proposta já aceita pelo cliente: não pode mais ser alterada.' };
  const companyName = s(fd, 'companyName');
  if (!companyName) return { error: 'Informe o nome da empresa.' };
  const monthlyCents = parseMoney(s(fd, 'monthly'));
  if (monthlyCents == null) return { error: 'Informe o investimento mensal (ex.: 259,00).' };
  let logo = current?.logo ?? null;
  const f = fd.get('logo');
  if (isUpload(f)) { if (!(f as File).type.startsWith('image/')) return { error: 'A logo precisa ser uma imagem.' }; await removeFile(logo); logo = await saveFile(f as File, 'propostas'); }
  else if (fd.get('remove_logo') === 'on') { await removeFile(logo); logo = null; }
  const data = {
    companyName, tradeName: opt(fd, 'tradeName'), document: s(fd, 'document').replace(/\D/g, '') || null, contactName: opt(fd, 'contactName'),
    phone: opt(fd, 'phone'), email: opt(fd, 'email'), instagram: opt(fd, 'instagram'), segment: opt(fd, 'segment'), city: opt(fd, 'city'), logo,
    objective: s(fd, 'objective'), region: s(fd, 'region'), points: int(fd, 'points'), screens: int(fd, 'screens'), dailyPlays: int(fd, 'dailyPlays'),
    benefits: JSON.stringify(s(fd, 'benefits').split('\n').map((x) => x.trim()).filter(Boolean)), monthlyCents, priceNote: s(fd, 'priceNote'),
    conditions: s(fd, 'conditions'), validUntil: /^\d{4}-\d{2}-\d{2}$/.test(s(fd, 'validUntil')) ? s(fd, 'validUntil') : null, showFolder: fd.get('showFolder') === 'on',
  };
  const p = current
    ? await db.proposal.update({ where: { id: current.id }, data: { ...data, ...(current.status === 'recusada' ? { status: 'rascunho', refusedAt: null, refuseReason: null } : {}) } })
    : await db.proposal.create({ data: { ...data, tenantId: user.tenantId, number: await nextProposalNumber(user.tenantId), publicToken: randomToken(18) } });
  revalidatePath('/propostas');
  if (!current) redirect(`/propostas/${p.id}`);
  return { ok: true, message: 'Proposta salva.' };
}

/** Marca como enviada (ao abrir o WhatsApp ou copiar o link). */
export async function markProposalSent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  await db.proposal.updateMany({ where: { id: s(fd, 'id'), tenantId: user.tenantId, status: 'rascunho' }, data: { status: 'enviada', sentAt: new Date() } });
  revalidatePath('/propostas', 'layout');
  return { ok: true };
}

export async function deleteProposal(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = await db.proposal.findFirst({ where: { id: s(fd, 'id'), tenantId: user.tenantId } });
  if (!p) return { error: 'Proposta não encontrada.' };
  if (p.status === 'aceita') return { error: 'Proposta aceita não pode ser excluída (é o registro do aceite do cliente).' };
  await db.proposal.delete({ where: { id: p.id } });
  if (p.logo && !(await db.client.count({ where: { image: p.logo } }))) await removeFile(p.logo);
  revalidatePath('/propostas');
  redirect('/propostas');
}

/** Copia uma proposta (para outro cliente ou nova versao). */
export async function duplicateProposal(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = await db.proposal.findFirst({ where: { id: s(fd, 'id'), tenantId: user.tenantId } });
  if (!p) return { error: 'Proposta não encontrada.' };
  const copy = await db.proposal.create({
    data: {
      tenantId: user.tenantId, number: await nextProposalNumber(user.tenantId), publicToken: randomToken(18), companyName: p.companyName, tradeName: p.tradeName, document: p.document,
      contactName: p.contactName, phone: p.phone, email: p.email, instagram: p.instagram, segment: p.segment, city: p.city, logo: p.logo, objective: p.objective, region: p.region,
      points: p.points, screens: p.screens, dailyPlays: p.dailyPlays, benefits: p.benefits, monthlyCents: p.monthlyCents, priceNote: p.priceNote, conditions: p.conditions, showFolder: p.showFolder,
    },
  });
  redirect(`/propostas/${copy.id}`);
}

/** Paginas do folder anexadas ao fim das propostas: troca/remove (sem pagina = usa as padrao da Yes). */
export async function saveProposalPages(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const cfg = folderConfig(user.tenant.folder);
  const remove = new Set(fd.getAll('remove_page').map(String));
  for (const k of cfg.proposalPages.filter((k) => remove.has(k))) await removeFile(k);
  const keep = cfg.proposalPages.filter((k) => !remove.has(k));
  const files = fd.getAll('pages').filter(isUpload) as File[];
  if (keep.length + files.length > 8) return { error: 'A proposta aceita até 8 páginas de folder.' };
  const added: string[] = [];
  for (const f of files) added.push(await saveFile(f, 'propostas'));
  cfg.proposalPages = [...keep, ...added];
  await db.tenant.update({ where: { id: user.tenantId }, data: { folder: JSON.stringify(cfg) } });
  revalidatePath('/propostas', 'layout');
  return { ok: true, message: 'Páginas do folder atualizadas.' };
}
