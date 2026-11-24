'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt, encrypt, signingSecret } from '@/lib/crypto';
import { str } from '@/lib/util';
import type { ActionResult } from '@/components/ui';

/** Mostra a senha da chave (so para o administrador da plataforma). */
export async function revealSigningPassword(): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const k = await db.signingKey.findUnique({ where: { name: 'android' } });
  const password = k ? decrypt(k.passwordEnc, signingSecret()) : null;
  return password ? { ok: true, password } : { ok: false, error: 'Não foi possível abrir a senha (confira SIGNING_KEY_SECRET no servidor).' };
}

/** Substitui a chave guardada (arquivo .jks/.p12, alias e senha). */
export async function saveSigningKey(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) return { error: 'Escolha o arquivo da chave (.jks ou .p12).' };
  if (file.size > 64 * 1024) return { error: 'Arquivo grande demais para uma chave.' };
  const alias = str(fd, 'alias');
  const password = String(fd.get('password') ?? '');
  if (!alias || password.length < 6) return { error: 'Informe o alias e a senha da chave.' };
  if (fd.get('confirm') !== 'on') return { error: 'Confirme que entende que trocar a chave impede atualizar os aparelhos por cima.' };
  const buf = Buffer.from(await file.arrayBuffer());
  const secret = signingSecret();
  const data = {
    alias, fileName: file.name.slice(0, 80), keystoreEnc: encrypt(buf.toString('base64'), secret), passwordEnc: encrypt(password, secret),
    sha256: (str(fd, 'sha256') ?? '').toUpperCase().replace(/[^0-9A-F:]/g, '') || `(arquivo) ${crypto.createHash('sha256').update(buf).digest('hex')}`,
    validUntil: str(fd, 'validUntil'), notes: String(fd.get('notes') ?? '').slice(0, 1000),
  };
  await db.signingKey.upsert({ where: { name: 'android' }, create: { name: 'android', ...data }, update: data });
  revalidatePath('/plataforma/chave');
  return { ok: true, message: 'Chave guardada (criptografada).' };
}
