import { db, like } from './db';
import { screenScope, type SessionUser } from './auth';
import { localDate } from './util';

export type ReportFilters = { de?: string; ate?: string; tela?: string; midia?: string; cliente?: string };

/** Comprovacao de exibicao: total por tela e por midia no periodo. */
export async function playReport(user: SessionUser, f: ReportFilters) {
  const today = localDate();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(f.de ?? '') ? f.de! : today.slice(0, 8) + '01';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(f.ate ?? '') ? f.ate! : today;
  const screens = await db.screen.findMany({ where: { ...screenScope(user), ...(f.tela ? { id: f.tela } : {}) }, select: { id: true, name: true, syncedAt: true, avgFlow: true } });
  const stats = await db.playStat.findMany({
    where: {
      screenId: { in: screens.map((s) => s.id) }, date: { gte: start, lte: end },
      media: { ...(f.midia ? { name: like(f.midia) } : {}), ...(f.cliente ? { clientId: f.cliente } : {}) },
    },
    include: { media: { select: { name: true, duration: true, client: { select: { name: true } } } } },
  });
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400_000) + 1);
  const byScreen = new Map<string, number>();
  const byMedia = new Map<string, { name: string; client: string; count: number; seconds: number; screens: Set<string> }>();
  for (const s of stats) {
    byScreen.set(s.screenId, (byScreen.get(s.screenId) ?? 0) + s.count);
    const m = byMedia.get(s.mediaId) ?? { name: s.media.name, client: s.media.client?.name ?? 'Avulso', count: 0, seconds: 0, screens: new Set<string>() };
    m.count += s.count; m.seconds += s.count * s.media.duration; m.screens.add(s.screenId);
    byMedia.set(s.mediaId, m);
  }
  return {
    start, end, days,
    total: stats.reduce((a, s) => a + s.count, 0),
    screens: screens.map((s) => ({ ...s, count: byScreen.get(s.id) ?? 0 })).filter((s) => s.count > 0 || f.tela).sort((a, b) => b.count - a.count),
    medias: [...byMedia.values()].map((m) => ({ ...m, screens: m.screens.size })).sort((a, b) => b.count - a.count),
  };
}
