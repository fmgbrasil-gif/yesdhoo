import { db } from './db';
import { localDate } from './util';

export const PROPOSAL_STATUS: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-ink-100 text-ink-600' },
  enviada: { label: 'Enviada', cls: 'bg-sky-100 text-sky-700' },
  aceita: { label: 'Aceita', cls: 'bg-emerald-100 text-emerald-700' },
  recusada: { label: 'Recusada', cls: 'bg-red-100 text-red-700' },
};

export const DEFAULT_BENEFITS = [
  'Veiculação em todos os pontos da rede, em todas as telas.',
  'Exposição em academias, restaurantes, supermercado, lanchonete e lojas.',
  'Divulgação de produtos, serviços, eventos e campanhas institucionais.',
  'Possibilidade de atualização das peças, mediante alinhamento com a YES.',
];
export const DEFAULT_CONDITIONS = 'Prazo, início da veiculação e formato do anúncio: a combinar.';
export const DEFAULT_FOLDER_PAGES = ['/proposta/folder-1.jpg', '/proposta/folder-2.jpg', '/proposta/folder-3.jpg', '/proposta/folder-4.jpg'];

/** Numeros da rede para a proposta: pontos (locais), telas e media de exibicoes diarias por tela (ultimos 30 dias). */
export async function networkStats(tenantId: string) {
  const screens = await db.screen.findMany({ where: { tenantId }, select: { id: true, clientId: true, name: true, city: true, state: true } });
  const points = new Set(screens.map((s) => s.clientId ?? s.id)).size;
  const since = new Date(Date.now() - 30 * 86400_000);
  const from = localDate('America/Sao_Paulo', since);
  const stats = await db.playStat.groupBy({ by: ['screenId', 'date'], where: { screenId: { in: screens.map((s) => s.id) }, date: { gte: from } }, _sum: { count: true } });
  const perDay = stats.map((s) => s._sum.count ?? 0).filter((n) => n > 0);
  const daily = perDay.length ? Math.round(perDay.reduce((a, n) => a + n, 0) / perDay.length) : 0;
  const cities = [...new Set(screens.map((s) => s.city && `${s.city.toUpperCase()}${s.state ? ' / ' + s.state : ''}`).filter(Boolean))] as string[];
  return { points, screens: screens.length, daily, region: cities[0] ?? '' };
}

export async function nextProposalNumber(tenantId: string) {
  const last = await db.proposal.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}
