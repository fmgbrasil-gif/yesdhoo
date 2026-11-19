import { headers } from 'next/headers';
import { db } from './db';

/** IP do visitante (atras de proxy/CDN o endereco real vem em x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'desconhecido').trim().slice(0, 64);
}

type Rule = { max: number; windowMin: number; lockMin: number };
export const LOGIN_RULE: Rule = { max: 5, windowMin: 15, lockMin: 15 };
export const LOGIN_IP_RULE: Rule = { max: 20, windowMin: 15, lockMin: 15 };
export const PAIR_RULE: Rule = { max: 10, windowMin: 10, lockMin: 10 };

/** Minutos restantes de bloqueio para a chave (0 = liberado). */
export async function lockedFor(key: string) {
  const t = await db.throttle.findUnique({ where: { key } });
  if (!t?.lockedUntil || t.lockedUntil <= new Date()) return 0;
  return Math.max(1, Math.ceil((t.lockedUntil.getTime() - Date.now()) / 60_000));
}

/** Registra uma tentativa que falhou; ao estourar o limite da janela, bloqueia a chave. */
export async function registerFailure(key: string, rule: Rule) {
  const now = new Date();
  const t = await db.throttle.findUnique({ where: { key } });
  const fresh = !t || now.getTime() - t.windowStart.getTime() > rule.windowMin * 60_000;
  const count = fresh ? 1 : t.count + 1;
  const lockedUntil = count >= rule.max ? new Date(now.getTime() + rule.lockMin * 60_000) : null;
  await db.throttle.upsert({
    where: { key },
    create: { key, count, windowStart: now, lockedUntil },
    update: { count: lockedUntil ? 0 : count, windowStart: fresh || lockedUntil ? now : t.windowStart, lockedUntil },
  });
}

export async function clearFailures(key: string) {
  await db.throttle.deleteMany({ where: { key } });
}

/** Regras de senha: devolve a mensagem de erro ou null se a senha serve. */
export function passwordProblem(password: string, email = '') {
  if (password.length < 8) return 'A senha precisa ter ao menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'A senha precisa ter letras e números.';
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'A senha não pode conter o seu e-mail.';
  if (/^(12345678|password1|senha123|yesdooh123|abc12345|qwerty123)$/i.test(password)) return 'Esta senha é muito comum. Escolha outra.';
  return null;
}
