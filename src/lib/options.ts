import { db } from './db';
import { ENTRY_CATEGORIES, PAYABLE_CATEGORIES } from './cash';

/** Opcoes de um campo: as cadastradas pelo + , as ja usadas e as padroes do sistema (sem repetir). */
export async function optionsFor(tenantId: string, kind: 'lancamento' | 'despesa' | 'categoria' | 'fornecedor') {
  const saved = (await db.savedOption.findMany({ where: { tenantId, kind }, orderBy: { value: 'asc' }, select: { value: true } })).map((o) => o.value);
  let used: string[] = [];
  if (kind === 'lancamento') used = (await db.cashEntry.findMany({ where: { tenantId, invoiceId: null, payableId: null, transferId: null }, distinct: ['description'], select: { description: true }, take: 200, orderBy: { createdAt: 'desc' } })).map((e) => e.description);
  if (kind === 'despesa') used = (await db.payable.findMany({ where: { tenantId }, distinct: ['description'], select: { description: true }, take: 200, orderBy: { createdAt: 'desc' } })).map((p) => p.description);
  if (kind === 'fornecedor') used = (await db.payable.findMany({ where: { tenantId, supplier: { not: null } }, distinct: ['supplier'], select: { supplier: true }, take: 200 })).map((p) => p.supplier!);
  const defaults = kind === 'categoria' ? [...PAYABLE_CATEGORIES, ...ENTRY_CATEGORIES] : [];
  const seen = new Set<string>();
  return [...saved, ...used, ...defaults].filter((v) => { const k = v.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
