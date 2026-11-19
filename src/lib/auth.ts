import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { cache } from 'react';
import { db } from './db';

const COOKIE = 'yd_session';
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === 'production') throw new Error('Defina AUTH_SECRET no ambiente de produção.');
  return new TextEncoder().encode(value || 'somente-desenvolvimento');
}

export async function createSession(userId: string, remember: boolean, sessionVersion = 0) {
  const days = remember ? 30 : 1;
  const token = await new SignJWT({ sub: userId, sv: sessionVersion }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${days}d`).sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
    ...(remember ? { maxAge: days * 86400 } : {}),
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const getUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = await db.user.findUnique({
      where: { id: String(payload.sub) },
      include: { tenant: true, screens: { select: { screenId: true } } },
    });
    // usuario desativado ou senha trocada depois da emissao: sessao deixa de valer
    return user && user.active && user.sessionVersion === Number(payload.sv ?? 0) ? user : null;
  } catch {
    return null;
  }
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/trocar-senha');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}

/** Filtro Prisma das telas que o usuario pode ver (sem restricao = todas do tenant). */
export function screenScope(user: SessionUser) {
  const ids = user.screens.map((s) => s.screenId);
  return { tenantId: user.tenantId, ...(ids.length ? { id: { in: ids } } : {}) };
}
