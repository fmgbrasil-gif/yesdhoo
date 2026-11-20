'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { slugify, str } from '@/lib/util';
import { parseMoney } from '@/lib/money';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { passwordProblem } from '@/lib/security';
import { enforceBilling } from '@/lib/tenant';
import { cancelSubscription, createSubscription } from '@/lib/billing';
import { localDate } from '@/lib/util';
import type { ActionResult } from '@/components/ui';

const COLOR = /^#[0-9a-f]{6}$/i;

async function readTenantFields(fd: FormData, currentId?: string) {
  const name = str(fd, 'name');
  if (!name) return { error: 'Informe o nome da empresa.' } as const;
  const slug = slugify(str(fd, 'slug') ?? name).slice(0, 40);
  if (slug.length < 3) return { error: 'O endereço de acesso precisa de ao menos 3 letras.' } as const;
  const taken = await db.tenant.findUnique({ where: { slug } });
  if (taken && taken.id !== currentId) return { error: `O endereço “${slug}” já é usado por outra empresa.` } as const;
  const color = str(fd, 'color') ?? '#8a52f8';
  if (!COLOR.test(color)) return { error: 'Cor inválida.' } as const;
  const planScreens = Math.max(1, Math.min(10000, Number(str(fd, 'planScreens')) || 10));
  const fee = str(fd, 'monthlyFee');
  const monthlyFeeCents = fee ? parseMoney(fee) : null;
  if (fee && monthlyFeeCents == null) return { error: 'Mensalidade inválida. Use o formato 490,00.' } as const;
  const dueDay = Math.max(1, Math.min(28, Number(str(fd, 'dueDay')) || 10));
  const autoBlock = str(fd, 'autoBlockDays');
  const autoBlockDays = autoBlock === null ? null : Math.max(0, Math.min(90, Number(autoBlock) || 0));
  return { name, slug, color, planScreens, monthlyFeeCents, dueDay, autoBlockDays, document: str(fd, 'document')?.replace(/\D/g, '') ?? null } as const;
}

async function readLogo(fd: FormData) {
  const file = fd.get('logo');
  if (!isUpload(file)) return { logo: undefined };
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) return { error: 'A logo deve ser PNG, JPG ou WEBP de até 2 MB.' };
  return { logo: await saveFile(file, 'logos') };
}

export async function createTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  const f = await readTenantFields(fd);
  if ('error' in f) return { error: f.error };
  const adminName = str(fd, 'adminName');
  const adminEmail = str(fd, 'adminEmail')?.toLowerCase();
  const adminPassword = str(fd, 'adminPassword');
  if (!adminName || !adminEmail || !adminPassword) return { error: 'Informe nome, e-mail e senha provisória do administrador da empresa.' };
  const weak = passwordProblem(adminPassword, adminEmail);
  if (weak) return { error: weak };
  if (await db.user.findUnique({ where: { email: adminEmail } })) return { error: 'Já existe um usuário com este e-mail.' };
  const logo = await readLogo(fd);
  if (logo.error) return { error: logo.error };
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  let billingId = '';
  await db.$transaction(async (tx) => {
    // a empresa vira um cliente da plataforma, para ser faturada pelo financeiro da plataforma
    const billing = await tx.client.create({ data: { tenantId: me.tenantId, kind: 'cliente', type: 'PJ', name: f.name, document: f.document, email: adminEmail } });
    billingId = billing.id;
    await tx.tenant.create({
      data: {
        name: f.name, slug: f.slug, color: f.color, planScreens: f.planScreens, document: f.document, logo: logo.logo ?? null, autoBlockDays: f.autoBlockDays, billingClientId: billing.id,
        users: { create: { name: adminName, email: adminEmail, passwordHash, role: 'admin', mustChangePassword: true } },
      },
    });
  });
  await syncPlatformFee(me.tenantId, billingId, f.monthlyFeeCents || null, f.dueDay);
  revalidatePath('/plataforma');
  return { ok: true };
}

async function ownTenant(id: string) {
  const t = await db.tenant.findUnique({ where: { id } });
  if (!t || t.isPlatform) throw new Error('Empresa não encontrada');
  return t;
}

export async function updateTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  const t = await ownTenant(String(fd.get('id')));
  const f = await readTenantFields(fd, t.id);
  if ('error' in f) return { error: f.error };
  const logo = await readLogo(fd);
  if (logo.error) return { error: logo.error };
  if (logo.logo) await removeFile(t.logo);
  await db.tenant.update({
    where: { id: t.id },
    data: { name: f.name, slug: f.slug, color: f.color, planScreens: f.planScreens, document: f.document, autoBlockDays: f.autoBlockDays, ...(logo.logo ? { logo: logo.logo } : {}) },
  });
  if (t.billingClientId) {
    await db.client.update({ where: { id: t.billingClientId }, data: { name: f.name, document: f.document } });
    await syncPlatformFee(me.tenantId, t.billingClientId, f.monthlyFeeCents || null, f.dueDay);
  }
  await enforceBilling(t.id);
  revalidatePath('/plataforma');
  return { ok: true };
}

export async function blockTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const t = await ownTenant(String(fd.get('id')));
  const reason = str(fd, 'reason') ?? 'Acesso suspenso pela administração.';
  await db.tenant.update({ where: { id: t.id }, data: { status: 'bloqueado', blockedReason: reason.slice(0, 300), blockedAt: new Date(), blockedAuto: false } });
  revalidatePath('/plataforma');
  return { ok: true };
}

export async function unblockTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const t = await ownTenant(String(fd.get('id')));
  // com fatura vencida e bloqueio automatico ligado, o sistema bloquearia de novo: desligue o automatico ou registre o pagamento
  await db.tenant.update({ where: { id: t.id }, data: { status: 'ativo', blockedReason: null, blockedAt: null, blockedAuto: false } });
  const after = await enforceBilling(t.id);
  revalidatePath('/plataforma');
  if (after?.status === 'bloqueado') return { error: 'A empresa tem fatura vencida além do prazo e o bloqueio automático a bloqueou de novo. Registre o pagamento ou aumente o prazo de tolerância.' };
  return { ok: true };
}

export async function resetTenantAdmin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const t = await ownTenant(String(fd.get('id')));
  const user = await db.user.findFirst({ where: { id: String(fd.get('userId')), tenantId: t.id } });
  const password = str(fd, 'password');
  if (!user || !password) return { error: 'Escolha o usuário e a nova senha provisória.' };
  const weak = passwordProblem(password, user.email);
  if (weak) return { error: weak };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, active: true, sessionVersion: { increment: 1 } } });
  await db.throttle.deleteMany({ where: { key: `login:${user.email}` } });
  revalidatePath('/plataforma');
  return { ok: true, message: `Senha provisória definida para ${user.email}. Ela será trocada no próximo acesso.` };
}

/** Cria, atualiza ou cancela a cobranca recorrente da mensalidade de uma empresa da plataforma. */
async function syncPlatformFee(platformTenantId: string, clientId: string, feeCents: number | null, dueDay: number) {
  const current = await db.subscription.findFirst({ where: { clientId, status: 'ativa', mode: 'recorrente' } });
  const items = [{ description: 'Licença de uso da plataforma de mídia indoor', quantity: 1, unitCents: feeCents ?? 0 }];
  if (!feeCents) { if (current) await cancelSubscription(current, { reason: 'Mensalidade removida', cancelOpen: false }); return; }
  if (current) {
    // vale para as proximas faturas; as ja geradas nao mudam
    await db.subscription.update({ where: { id: current.id }, data: { amountCents: feeCents, dueDay, items: JSON.stringify(items) } });
  } else {
    await createSubscription(platformTenantId, { clientId, mode: 'recorrente', items, dueDay, startMonth: localDate().slice(0, 7) });
  }
}
