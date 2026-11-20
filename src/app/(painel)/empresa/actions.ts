'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { str } from '@/lib/util';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { encrypt, randomToken } from '@/lib/crypto';
import { pixKeyProblem } from '@/lib/pix';
import { asaas, BankError } from '@/lib/bank/asaas';
import { checkOpenAiKey } from '@/lib/ai-contract';
import type { ActionResult } from '@/components/ui';

const COLOR = /^#[0-9a-f]{6}$/i;

export async function saveCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const name = str(fd, 'name');
  if (!name) return { error: 'Informe o nome da empresa.' };
  const color = str(fd, 'color') ?? user.tenant.color;
  if (!COLOR.test(color)) return { error: 'Cor inválida.' };
  let logo = user.tenant.logo;
  const file = fd.get('logo');
  if (isUpload(file)) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { error: 'Envie a logo em PNG, JPG ou WEBP.' };
    if (file.size > 2 * 1024 * 1024) return { error: 'A logo deve ter no máximo 2 MB.' };
    await removeFile(logo);
    logo = await saveFile(file, 'logos');
  }
  if (fd.get('removeLogo') === 'on') { await removeFile(logo); logo = null; }
  const field = (k: string) => str(fd, k);
  await db.tenant.update({
    where: { id: user.tenantId },
    data: {
      name, color, logo, document: field('document')?.replace(/\D/g, '') ?? null, tradeName: field('tradeName'), stateRegistration: field('stateRegistration'),
      email: field('email'), phone: field('phone'), road: field('road'), number: field('number'), complement: field('complement'),
      neighborhood: field('neighborhood'), zipcode: field('zipcode'), city: field('city'), state: field('state'),
    },
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Dados da empresa salvos.' };
}

export async function savePix(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const key = str(fd, 'pixKey');
  if (key) { const p = pixKeyProblem(key); if (p) return { error: p }; }
  await db.tenant.update({
    where: { id: user.tenantId },
    data: {
      pixKey: key, pixName: str(fd, 'pixName'), pixCity: str(fd, 'pixCity'), invoiceNotes: String(fd.get('invoiceNotes') ?? '').slice(0, 1000),
      invoiceTitle: (str(fd, 'invoiceTitle') ?? 'FATURA DE SERVIÇOS').toUpperCase().slice(0, 40), invoiceNature: (str(fd, 'invoiceNature') ?? '').toUpperCase().slice(0, 80),
      invoiceFiscal: String(fd.get('invoiceFiscal') ?? '').slice(0, 600),
    },
  });
  revalidatePath('/empresa');
  return { ok: true, message: 'Dados de cobrança salvos.' };
}

/** Liga ou desliga o banco para boletos. A chave e testada antes de ser gravada (criptografada). */
export async function saveBank(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  if (fd.get('disconnect') === '1') {
    await db.tenant.update({ where: { id: user.tenantId }, data: { bankProvider: null, bankApiKey: null } });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Banco desconectado. As faturas voltam a usar só a sua chave Pix.' };
  }
  const env = fd.get('bankEnv') === 'producao' ? 'producao' : 'sandbox';
  const apiKey = str(fd, 'apiKey');
  if (!apiKey && !user.tenant.bankApiKey) return { error: 'Cole a chave de API do Asaas.' };
  if (apiKey) {
    try { await asaas.ping(env, apiKey); } catch (e) { return { error: e instanceof BankError ? e.message : 'Não foi possível validar a chave.' }; }
  }
  await db.tenant.update({
    where: { id: user.tenantId },
    data: { bankProvider: 'asaas', bankEnv: env, ...(apiKey ? { bankApiKey: encrypt(apiKey) } : {}), bankWebhookToken: user.tenant.bankWebhookToken ?? randomToken(24) },
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Banco conectado. Agora configure o aviso de pagamento no Asaas (instruções abaixo).' };
}

export async function rotateWebhookToken(): Promise<ActionResult> {
  const user = await requireAdmin();
  await db.tenant.update({ where: { id: user.tenantId }, data: { bankWebhookToken: randomToken(24) } });
  revalidatePath('/empresa');
  return { ok: true };
}

/** Chave da OpenAI (ChatGPT) para gerar contratos. Testada antes de gravar (criptografada). */
export async function saveAi(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  if (fd.get('remove') === '1') {
    await db.tenant.update({ where: { id: user.tenantId }, data: { aiApiKey: null } });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Chave removida.' };
  }
  const key = (str(fd, 'aiApiKey') ?? '').replace(/\s+/g, '');
  if (!key) return { error: 'Cole a chave da API da OpenAI.' };
  if (!key.startsWith('sk-')) return { error: 'A chave da OpenAI começa com sk-. Confira se copiou a chave certa.' };
  const err = await checkOpenAiKey(key);
  if (err) return { error: err };
  await db.tenant.update({ where: { id: user.tenantId }, data: { aiApiKey: encrypt(key) } });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Chave salva e testada. A geração de contratos com IA já está liberada.' };
}
