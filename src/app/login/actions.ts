'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { createSession, destroySession } from '@/lib/auth';
import type { ActionResult } from '@/components/ui';

export async function login(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return { error: 'E-mail ou senha inválidos.' };
  await createSession(user.id, fd.get('remember') === 'on');
  redirect('/dashboard');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
