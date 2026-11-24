import { db, like } from './db';
import { localDate } from './util';
import { competenceLabel, invoiceLink } from './billing';

/** situacao: '' todas (sem canceladas) | aberta (a vencer) | vencida | paga | cancelada (arquivo morto). Periodo pelo vencimento. */
export type DebtFilters = { cliente?: string; operacao?: string; situacao?: string; de?: string | null; ate?: string | null; por?: string };

/** Filtro de periodo das faturas: pelo vencimento ou pelo mes de referencia (avulsas sem referencia usam o vencimento). */
export function invoicePeriod(por: string | undefined, de: string | null | undefined, ate: string | null | undefined) {
  if (!de || !ate) return {};
  if (por !== 'ref') return { dueDate: { gte: de, lte: ate } };
  return { OR: [{ competence: { gte: de.slice(0, 7), lte: ate.slice(0, 7) } }, { competence: null, dueDate: { gte: de, lte: ate } }] };
}

export const SITUACOES: [string, string][] = [['aberta', 'Em aberto'], ['vencida', 'Vencidas'], ['paga', 'Pagas'], ['todas', 'Todas'], ['cancelada', 'Arquivo morto']];
export const REPORT_TITLE: Record<string, string> = { '': 'Relatório de contas a receber', todas: 'Relatório de contas a receber', aberta: 'Relatório de débitos em aberto', vencida: 'Relatório de débitos vencidos', paga: 'Relatório de recebimentos', cancelada: 'Relatório de faturas canceladas' };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400_000);

/** Faturas agrupadas por cliente (vencido, a vencer, recebido, maior atraso), com as faturas de cada um. */
export async function openDebts(tenantId: string, f: DebtFilters) {
  const today = localDate();
  // padrao: em aberto (nao pago, inclusive vencidas de antes do periodo); "todas" = tudo menos o arquivo morto
  const sit = f.situacao === 'todas' ? '' : f.situacao || 'aberta';
  const status = sit === 'vencida' ? { status: 'aberta', dueDate: { lt: today } } : sit === 'aberta' ? { status: 'aberta' } : sit === 'paga' || sit === 'cancelada' ? { status: sit } : { status: { not: 'cancelada' } };
  const range = f.por !== 'ref' && f.de && f.ate ? { gte: f.de, lte: f.ate } : null;
  const refPeriod = f.por === 'ref' ? invoicePeriod('ref', f.de, f.ate) : {};
  const dueDate = { ...((status as { dueDate?: object }).dueDate ?? {}), ...(range ?? {}) };
  if (range && sit === 'vencida' && today <= range.lte) Object.assign(dueDate, { lte: range.lte, lt: today });
  const openPrev = sit === 'aberta' && range ? { OR: [{ dueDate: { gte: range.gte } }, { dueDate: { lt: today } }] } : {};
  if (sit === 'aberta' && range) delete (dueDate as { gte?: string }).gte; // vencidas de antes do periodo continuam aparecendo
  const invoices = await db.invoice.findMany({
    where: {
      tenantId, ...status, ...(Object.keys(dueDate).length ? { dueDate } : {}), ...refPeriod, ...openPrev,
      ...(f.cliente ? { client: { name: like(f.cliente) } } : {}),
      ...(f.operacao ? { operationId: f.operacao } : {}),
    },
    orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
    include: { client: { select: { id: true, name: true, tradeName: true, document: true, phone1: true, email: true } }, operation: { select: { name: true, accountId: true } }, subscription: { select: { status: true } } },
  });
  type Item = { id: string; number: number; ref: string; dueDate: string; late: number; amountCents: number; link: string; operation: string | null; state: string; inv: (typeof invoices)[number] };
  const groups = new Map<string, { client: (typeof invoices)[number]['client']; items: Item[]; overdueCents: number; openCents: number; paidCents: number; otherCents: number; maxLate: number }>();
  for (const inv of invoices) {
    const g = groups.get(inv.clientId) ?? { client: inv.client, items: [], overdueCents: 0, openCents: 0, paidCents: 0, otherCents: 0, maxLate: 0 };
    const state = inv.status === 'aberta' ? (inv.dueDate < today ? 'vencida' : 'aberta') : inv.status;
    const late = state === 'vencida' ? days(inv.dueDate, today) : 0;
    g.items.push({ id: inv.id, number: inv.number, ref: inv.competence ? competenceLabel(inv.competence) : 'avulsa', dueDate: inv.dueDate, late, amountCents: inv.amountCents, link: invoiceLink(inv), operation: inv.operation?.name ?? null, state, inv });
    if (state === 'vencida') g.overdueCents += inv.amountCents; else if (state === 'aberta') g.openCents += inv.amountCents; else if (state === 'paga') g.paidCents += inv.paidCents ?? inv.amountCents; else g.otherCents += inv.amountCents;
    g.maxLate = Math.max(g.maxLate, late);
    groups.set(inv.clientId, g);
  }
  const list = [...groups.values()].sort((a, b) => b.overdueCents - a.overdueCents || (b.openCents + b.paidCents + b.otherCents) - (a.openCents + a.paidCents + a.otherCents));
  const sum = (k: 'overdueCents' | 'openCents' | 'paidCents' | 'otherCents') => list.reduce((a, g) => a + g[k], 0);
  const overdue = sum('overdueCents'), open = sum('openCents'), paid = sum('paidCents'), other = sum('otherCents');
  return { today, list, totals: { overdue, open, paid, other, debt: overdue + open, total: overdue + open + paid + other, clients: list.length, debtors: list.filter((g) => g.overdueCents + g.openCents > 0).length, invoices: invoices.length } };
}
