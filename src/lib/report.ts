import { db, like } from './db';
import { screenScope, type SessionUser } from './auth';
import { localDate } from './util';

export type ReportFilters = {
  de?: string; ate?: string; periodo?: string; mes?: string;
  tela?: string; midia?: string; cliente?: string; operacao?: string; segmento?: string; cidade?: string; tipo?: string; kind?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(y, m, 0).getDate())}`; };
const shift = (iso: string, days: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Periodo do relatorio: atalhos (este mes, mes passado, 7/30 dias, mes escolhido) ou datas livres. */
export function reportPeriod(f: ReportFilters) {
  const today = localDate();
  const ym = today.slice(0, 7);
  if (f.mes && /^\d{4}-\d{2}$/.test(f.mes)) return { start: `${f.mes}-01`, end: lastDay(f.mes) < today ? lastDay(f.mes) : today };
  if (f.periodo === 'mes-passado') { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 2, 1); const p = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; return { start: `${p}-01`, end: lastDay(p) }; }
  if (f.periodo === '7d') return { start: shift(today, -6), end: today };
  if (f.periodo === '30d') return { start: shift(today, -29), end: today };
  if (f.periodo === 'hoje') return { start: today, end: today };
  const start = /^\d{4}-\d{2}-\d{2}$/.test(f.de ?? '') ? f.de! : `${ym}-01`;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(f.ate ?? '') ? f.ate! : today;
  return { start, end };
}

const mediaKind = (tipo?: string) =>
  tipo === 'video' ? { type: 'arquivo', kind: 'video' } : tipo === 'imagem' ? { type: 'arquivo', kind: 'image' }
  : tipo === 'dinamico' ? { type: { notIn: ['arquivo', 'youtube', 'link'] } } : tipo === 'youtube' ? { type: { in: ['youtube', 'link'] } } : {};

/** Comprovacao de exibicao: totais por tela, midia, cliente e dia no periodo, com filtros gerais e individuais. */
export async function playReport(user: SessionUser, f: ReportFilters) {
  const { start, end } = reportPeriod(f);
  const screens = await db.screen.findMany({
    where: {
      ...screenScope(user), ...(f.tela ? { id: f.tela } : {}), ...(f.segmento ? { categoryId: f.segmento } : {}), ...(f.cidade ? { city: f.cidade } : {}),
      ...(f.operacao ? { operations: { some: { id: f.operacao } } } : {}),
    },
    select: { id: true, name: true, syncedAt: true, avgFlow: true, city: true, state: true },
  });
  const stats = await db.playStat.findMany({
    where: {
      screenId: { in: screens.map((s) => s.id) }, date: { gte: start, lte: end },
      media: { ...(f.midia ? { name: like(f.midia) } : {}), ...(f.cliente ? { clientId: f.cliente } : {}), ...mediaKind(f.tipo) },
    },
    include: { media: { select: { name: true, duration: true, type: true, kind: true, clientId: true, client: { select: { id: true, name: true, phone1: true, kind: true } } } } },
  });
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400_000) + 1);
  const byScreen = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byMedia = new Map<string, { id: string; name: string; client: string; count: number; seconds: number; screens: Set<string> }>();
  const byClient = new Map<string, { id: string; name: string; phone: string | null; kind: string; count: number; seconds: number; medias: Set<string>; screens: Set<string> }>();
  for (const s of stats) {
    byScreen.set(s.screenId, (byScreen.get(s.screenId) ?? 0) + s.count);
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.count);
    const m = byMedia.get(s.mediaId) ?? { id: s.mediaId, name: s.media.name, client: s.media.client?.name ?? 'Avulso', count: 0, seconds: 0, screens: new Set<string>() };
    m.count += s.count; m.seconds += s.count * s.media.duration; m.screens.add(s.screenId);
    byMedia.set(s.mediaId, m);
    const c = s.media.client;
    if (c) {
      const x = byClient.get(c.id) ?? { id: c.id, name: c.name, phone: c.phone1, kind: c.kind, count: 0, seconds: 0, medias: new Set<string>(), screens: new Set<string>() };
      x.count += s.count; x.seconds += s.count * s.media.duration; x.medias.add(s.mediaId); x.screens.add(s.screenId);
      byClient.set(c.id, x);
    }
  }
  const dayList: { date: string; count: number }[] = [];
  for (let d = start; d <= end && dayList.length < 400; d = shift(d, 1)) dayList.push({ date: d, count: byDay.get(d) ?? 0 });
  return {
    start, end, days,
    total: stats.reduce((a, s) => a + s.count, 0),
    seconds: stats.reduce((a, s) => a + s.count * s.media.duration, 0),
    screens: screens.map((s) => ({ ...s, count: byScreen.get(s.id) ?? 0 })).filter((s) => s.count > 0 || f.tela).sort((a, b) => b.count - a.count),
    medias: [...byMedia.values()].map((m) => ({ ...m, screens: m.screens.size })).sort((a, b) => b.count - a.count),
    clients: [...byClient.values()].map((c) => ({ ...c, medias: c.medias.size, screens: c.screens.size })).sort((a, b) => b.count - a.count),
    byDay: dayList,
  };
}
