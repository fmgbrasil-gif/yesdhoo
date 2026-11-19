'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { bool, str } from '@/lib/util';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { createSession } from '@/lib/auth';
import { passwordProblem } from '@/lib/security';
import type { ActionResult } from '@/components/ui';

export async function saveUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, 'id');
  const current = id ? await db.user.findFirst({ where: { id, tenantId: admin.tenantId } }) : null;
  if (id && !current) return { error: 'Usuário não encontrado.' };
  const name = str(fd, 'name');
  const email = str(fd, 'email')?.toLowerCase();
  const password = str(fd, 'password');
  if (!name || !email) return { error: 'Informe nome e e-mail.' };
  if (!current && !password) return { error: 'Defina uma senha.' };
  const weak = password ? passwordProblem(password, email) : null;
  if (weak) return { error: weak };
  if (!current && password !== str(fd, 'passwordConfirm')) return { error: 'As senhas não conferem.' };
  const dup = await db.user.findUnique({ where: { email } });
  if (dup && dup.id !== current?.id) return { error: 'Já existe um usuário com este e-mail.' };
  const self = current?.id === admin.id;
  let image = current?.image ?? null;
  if (isUpload(fd.get('image'))) { await removeFile(image); image = await saveFile(fd.get('image') as File, 'usuarios'); }
  const data = {
    name, email, image, timezone: str(fd, 'timezone') ?? 'America/Sao_Paulo',
    // ninguem rebaixa ou desativa a propria conta
    role: self ? 'admin' : fd.get('role') === 'admin' ? 'admin' : 'operador',
    active: self ? true : bool(fd, 'active'),
    restricted: bool(fd, 'restricted'),
    // senha definida pelo administrador e provisoria: a pessoa troca no primeiro acesso e as sessoes antigas caem
    ...(password ? { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: !self, sessionVersion: (current?.sessionVersion ?? 0) + 1 } : {}),
    // desativar tambem derruba a sessao (getUser confere `active` a cada requisicao)
  };
  const user = current ? await db.user.update({ where: { id: current.id }, data }) : await db.user.create({ data: { ...data, passwordHash: data.passwordHash!, tenantId: admin.tenantId } });
  const screens = await db.screen.findMany({ where: { tenantId: admin.tenantId, id: { in: fd.getAll('screens').map(String) } }, select: { id: true } });
  await db.userScreen.deleteMany({ where: { userId: user.id } });
  await db.userScreen.createMany({ data: screens.map((s) => ({ userId: user.id, screenId: s.id })) });
  if (self && password) await createSession(user.id, false, user.sessionVersion); // mantem o proprio administrador logado
  revalidatePath('/usuarios');
  return { ok: true };
}

export async function saveAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = str(fd, 'name');
  if (!name) return { error: 'Informe seu nome.' };
  const password = str(fd, 'password');
  if (password) {
    const weak = passwordProblem(password, user.email);
    if (weak) return { error: weak };
    if (!(await bcrypt.compare(String(fd.get('current') ?? ''), user.passwordHash))) return { error: 'Senha atual incorreta.' };
  }
  let image = user.image;
  if (isUpload(fd.get('image'))) { await removeFile(image); image = await saveFile(fd.get('image') as File, 'usuarios'); }
  const updated = await db.user.update({
    where: { id: user.id },
    data: { name, image, timezone: str(fd, 'timezone') ?? user.timezone, ...(password ? { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } } : {}) },
  });
  // trocar a senha encerra as sessoes em outros aparelhos; esta continua valendo
  if (password) await createSession(updated.id, false, updated.sessionVersion);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Dados atualizados.' };
}
