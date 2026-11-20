'use server';

import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseMoney } from '@/lib/money';

/** Catalogo de servicos: chamado direto pelo componente de itens (sem recarregar a pagina). */
type Created = { ok: false; error: string } | { ok: true; service: { id: string; name: string; unit: string; priceCents: number } };

export async function createService(fd: FormData): Promise<Created> {
  const user = await requireAdmin();
  const name = String(fd.get('name') ?? '').trim().slice(0, 120);
  const unit = String(fd.get('unit') ?? 'un').trim().slice(0, 12) || 'un';
  const priceCents = parseMoney(String(fd.get('price') ?? ''));
  if (!name) return { ok: false, error: 'Informe o nome do serviço.' };
  if (priceCents == null) return { ok: false, error: 'Preço inválido.' };
  const s = await db.service.create({ data: { tenantId: user.tenantId, name, unit, priceCents } });
  return { ok: true, service: { id: s.id, name: s.name, unit: s.unit, priceCents: s.priceCents } };
}

export async function deleteService(fd: FormData) {
  const user = await requireAdmin();
  await db.service.deleteMany({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  return { ok: true } as const;
}
