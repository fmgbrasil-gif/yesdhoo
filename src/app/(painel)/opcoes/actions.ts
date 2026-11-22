'use server';

import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

const KINDS = ['lancamento', 'despesa', 'categoria', 'fornecedor'];

/** Cadastra uma opcao (botao + dos campos). Devolve a lista atualizada daquele tipo. */
export async function addOption(kind: string, value: string): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const v = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!KINDS.includes(kind)) return { ok: false, error: 'Tipo inválido.' };
  if (!v) return { ok: false, error: 'Digite o nome da opção.' };
  await db.savedOption.upsert({ where: { tenantId_kind_value: { tenantId: user.tenantId, kind, value: v } }, create: { tenantId: user.tenantId, kind, value: v }, update: {} });
  return { ok: true, value: v };
}

export async function removeOption(kind: string, value: string) {
  const user = await requireUser();
  await db.savedOption.deleteMany({ where: { tenantId: user.tenantId, kind, value } });
  return { ok: true } as const;
}
