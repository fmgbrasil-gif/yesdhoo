import crypto from 'node:crypto';
import { db } from './db';

/** Link publico do relatorio mensal de veiculacoes do cliente: assinado (nao da para trocar cliente ou mes). */
const secret = () => 'yd-relatorio:' + (process.env.AUTH_SECRET || 'somente-desenvolvimento');
const sign = (s: string) => crypto.createHmac('sha256', secret()).update(s).digest('base64url').slice(0, 22);

export function clientReportToken(clientId: string, month: string) {
  const body = Buffer.from(`${clientId}|${month}`).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readClientReportToken(token: string): { clientId: string; month: string } | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || sign(body) !== sig) return null;
  const [clientId, month] = Buffer.from(body, 'base64url').toString().split('|');
  return clientId && /^\d{4}-\d{2}$/.test(month ?? '') ? { clientId, month } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Veiculacoes do cliente no mes: por midia, por tela (com endereco) e por dia. */
export async function clientMonthReport(clientId: string, month: string) {
  const client = await db.client.findUnique({ where: { id: clientId }, include: { tenant: true } });
  if (!client) return null;
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = `${month}-${pad(new Date(y, m, 0).getDate())}`;
  const stats = await db.playStat.findMany({
    where: { date: { gte: start, lte: end }, media: { clientId } },
    include: { media: { select: { name: true, duration: true } }, screen: { select: { name: true, city: true, state: true, neighborhood: true, avgFlow: true } } },
  });
  const medias = new Map<string, { name: string; count: number; seconds: number; screens: Set<string> }>();
  const screens = new Map<string, { name: string; place: string; count: number; flow: number | null }>();
  const days = new Map<string, number>();
  for (const s of stats) {
    const md = medias.get(s.mediaId) ?? { name: s.media.name, count: 0, seconds: 0, screens: new Set<string>() };
    md.count += s.count; md.seconds += s.count * s.media.duration; md.screens.add(s.screenId); medias.set(s.mediaId, md);
    const sc = screens.get(s.screenId) ?? { name: s.screen.name, place: [s.screen.neighborhood, s.screen.city && `${s.screen.city}${s.screen.state ? '/' + s.screen.state : ''}`].filter(Boolean).join(' · '), count: 0, flow: s.screen.avgFlow };
    sc.count += s.count; screens.set(s.screenId, sc);
    days.set(s.date, (days.get(s.date) ?? 0) + s.count);
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  const total = stats.reduce((a, s) => a + s.count, 0);
  const activeDays = days.size;
  // pessoas impactadas (estimativa): fluxo medio diario de cada tela x dias com exibicao naquela tela
  const screenDays = new Map<string, Set<string>>();
  for (const s of stats) screenDays.set(s.screenId, (screenDays.get(s.screenId) ?? new Set<string>()).add(s.date));
  const impact = [...screens.entries()].reduce((a, [id, sc]) => a + (sc.flow ?? 0) * (screenDays.get(id)?.size ?? 0), 0);
  return {
    client, tenant: client.tenant, month, start, end, total, activeDays, impact,
    seconds: stats.reduce((a, s) => a + s.count * s.media.duration, 0),
    medias: [...medias.values()].map((x) => ({ ...x, screens: x.screens.size })).sort((a, b) => b.count - a.count),
    screens: [...screens.values()].sort((a, b) => b.count - a.count),
    days: Array.from({ length: daysInMonth }, (_, i) => { const d = `${month}-${pad(i + 1)}`; return { date: d, count: days.get(d) ?? 0 }; }),
  };
}
