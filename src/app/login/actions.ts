'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { createSession, destroySession, getUser } from '@/lib/auth';
import { LOGIN_IP_RULE, LOGIN_RULE, clearFailures, clientIp, lockedFor, passwordProblem, registerFailure } from '@/lib/security';
import type { ActionResult } from '@/components/ui';

// usado quando o e-mail nao existe, para a resposta demorar o mesmo que uma senha errada
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.6b0XgQ0y1b9Qe2s2Y0mYb1m0vG6K';

export async function login(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get('email') || '').trim().toLowerCase().slice(0, 200);
  const password = String(fd.get('password') || '');
  const ip = await clientIp();
  const keys = { email: `login:${email}`, ip: `login-ip:${ip}` };

  const wait = Math.max(await lockedFor(keys.email), await lockedFor(keys.ip));
  if (wait) return { error: `Muitas tentativas. Aguarde ${wait} minuto(s) e tente de novo.` };

  const user = await db.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !ok) {
    await Promise.all([registerFailure(keys.email, LOGIN_RULE), registerFailure(keys.ip, LOGIN_IP_RULE)]);
    return { error: 'E-mail ou senha inválidos.' }; // mesma mensagem para nao revelar quais e-mails existem
  }
  await clearFailures(keys.email);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, fd.get('remember') === 'on', user.sessionVersion);
  redirect(user.mustChangePassword ? '/trocar-senha' : '/dashboard');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

/** Troca obrigatoria da senha provisoria no primeiro acesso. */
export async function changeFirstPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getUser();
  if (!user) redirect('/login');
  const password = String(fd.get('password') || '');
  if (password !== String(fd.get('confirm') || '')) return { error: 'As senhas não conferem.' };
  const problem = passwordProblem(password, user.email);
  if (problem) return { error: problem };
  if (await bcrypt.compare(password, user.passwordHash)) return { error: 'A nova senha precisa ser diferente da provisória.' };
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  await createSession(updated.id, false, updated.sessionVersion);
  redirect('/dashboard');
}
