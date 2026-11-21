import { db, like } from './db';
import { localDate } from './util';
import { competenceLabel, invoiceLink } from './billing';

export type DebtFilters = { cliente?: string; operacao?: string; situacao?: string; ate?: string; futuras?: string };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400_000);

/** Debitos em aberto agrupados por cliente (vencido, a vencer, maior atraso), com as faturas de cada um. */
export async function openDebts(tenantId: string, f: DebtFilters) {
  const today = localDate();
  // sem data escolhida, "a vencer" vai ate o fim do mes (as recorrentes tem 12 faturas projetadas a frente)
  const endOfMonth = (() => { const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0); return `${today.slice(0, 7)}-${String(d.getDate()).padStart(2, '0')}`; })();
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(f.ate ?? '') ? f.ate! : f.futuras === '1' ? null : endOfMonth;
  const due = f.situacao === 'vencidas' ? { lt: today } : f.situacao === 'avencer' ? { gte: today, ...(ate ? { lte: ate } : {}) } : ate ? { lte: ate } : undefined;
  const invoices = await db.invoice.findMany({
    where: {
      tenantId, status: 'aberta', ...(due ? { dueDate: due } : {}),
      ...(f.cliente ? { client: { name: like(f.cliente) } } : {}),
      ...(f.operacao ? { operationId: f.operacao } : {}),
    },
    orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
    include: { client: { select: { id: true, name: true, tradeName: true, document: true, phone1: true, email: true } }, operation: { select: { name: true, accountId: true } }, subscription: { select: { status: true } } },
  });
  const groups = new Map<string, { client: (typeof invoices)[number]['client']; items: { id: string; number: number; ref: string; dueDate: string; late: number; amountCents: number; link: string; operation: string | null; inv: (typeof invoices)[number] }[]; overdueCents: number; openCents: number; maxLate: number }>();
  for (const inv of invoices) {
    const g = groups.get(inv.clientId) ?? { client: inv.client, items: [], overdueCents: 0, openCents: 0, maxLate: 0 };
    const late = inv.dueDate < today ? days(inv.dueDate, today) : 0;
    g.items.push({ id: inv.id, number: inv.number, ref: inv.competence ? competenceLabel(inv.competence) : 'avulsa', dueDate: inv.dueDate, late, amountCents: inv.amountCents, link: invoiceLink(inv), operation: inv.operation?.name ?? null, inv });
    if (late) g.overdueCents += inv.amountCents; else g.openCents += inv.amountCents;
    g.maxLate = Math.max(g.maxLate, late);
    groups.set(inv.clientId, g);
  }
  const list = [...groups.values()].sort((a, b) => b.overdueCents - a.overdueCents || b.openCents + b.overdueCents - (a.openCents + a.overdueCents));
  const overdue = list.reduce((a, g) => a + g.overdueCents, 0);
  const open = list.reduce((a, g) => a + g.openCents, 0);
  return { today, ate, list, totals: { overdue, open, total: overdue + open, clients: list.length, invoices: invoices.length } };
}
