import type { PayableSeries } from '@prisma/client';
import { db } from './db';
import { localDate } from './util';
import { addMonths, competenceLabel, monthsDue } from './billing';

/** Dia de vencimento no mes (dia 31 vira o ultimo dia dos meses menores). */
export const dueIn = (ym: string, day: number) => {
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  return `${ym}-${String(Math.min(Math.max(1, day), last)).padStart(2, '0')}`;
};

/** Lanca as contas que faltam da despesa fixa: sempre 12 meses a frente (mesma regra das cobrancas recorrentes). */
export async function generatePayables(s: PayableSeries, today = localDate()) {
  if (s.status !== 'ativa') return 0;
  const done = new Set((await db.payable.findMany({ where: { seriesId: s.id }, select: { competence: true } })).map((p) => p.competence));
  let created = 0;
  for (const ym of monthsDue({ mode: 'recorrente', startMonth: s.startMonth, months: null, dueDay: s.dueDay }, today)) {
    if (done.has(ym)) continue;
    try {
      await db.payable.create({ data: {
        tenantId: s.tenantId, seriesId: s.id, competence: ym, description: s.description, supplier: s.supplier, category: s.category,
        amountCents: s.amountCents, dueDate: dueIn(ym, s.dueDay), notes: s.notes,
      } });
      created++;
    } catch (e) { if ((e as { code?: string }).code !== 'P2002') throw e; } // outra execucao ja lancou este mes
  }
  return created;
}

/** Roda todas as despesas fixas ativas (de uma empresa ou de todas). */
export async function runPayableSeries(tenantId?: string) {
  const series = await db.payableSeries.findMany({ where: { status: 'ativa', ...(tenantId ? { tenantId } : {}) } });
  let created = 0;
  for (const s of series) created += await generatePayables(s);
  return created;
}

export const seriesLabel = (s: Pick<PayableSeries, 'dueDay' | 'startMonth'>) => `todo dia ${s.dueDay}, desde ${competenceLabel(s.startMonth)}`;
export { addMonths };
