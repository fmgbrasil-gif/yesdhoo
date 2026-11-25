import type { Prisma } from '@prisma/client';
import { db } from './db';
import { WEEK_DAYS } from './constants';
import type { FolderConfig } from './folder';

const daysLabel = (wd: string) => {
  const list = wd.split(',').filter(Boolean).map(Number).sort();
  if (!list.length || list.length === 7) return 'Todos os dias';
  if (list.join(',') === '1,2,3,4,5') return 'Segunda a sexta';
  if (list.join(',') === '1,2,3,4,5,6') return 'Segunda a sábado';
  return list.map((d) => WEEK_DAYS[d]).join(', ');
};
const perWeek = (wd: string) => wd.split(',').filter(Boolean).length || 7;
const mins = (t: string | null) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const n = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** Pontos do folder e os numeros da rede (calculados; o que foi digitado no folder tem prioridade). */
export async function folderData(where: Prisma.ScreenWhereInput, cfg: FolderConfig) {
  const screens = await db.screen.findMany({
    where: { ...where, promoInclude: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }],
    include: {
      category: { select: { name: true } }, client: { select: { name: true } },
      items: { include: { media: { select: { duration: true, active: true } }, group: { include: { medias: { take: 1, include: { media: { select: { duration: true } } } } } } } },
    },
  });
  const flowDay = screens.reduce((a, s) => a + (s.avgFlow ?? 0), 0);
  const flowMonth = screens.reduce((a, s) => a + (s.avgFlow ?? 0) * perWeek(s.weekDays) * (30 / 7), 0);
  const cities = [...new Set(screens.map((s) => s.city && `${s.city}${s.state ? '/' + s.state : ''}`).filter(Boolean))] as string[];
  const segments = [...new Set(screens.map((s) => s.category?.name).filter(Boolean))] as string[];
  const daysCount = new Map<string, number>();
  for (const s of screens) daysCount.set(daysLabel(s.weekDays), (daysCount.get(daysLabel(s.weekDays)) ?? 0) + 1);
  const days = [...daysCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const hours = screens.map((s) => { const a = mins(s.workStart), b = mins(s.workEnd); return a != null && b != null && b > a ? (b - a) / 60 : null; }).filter((x): x is number => x != null);
  const hoursAvg = hours.length ? hours.reduce((a, x) => a + x, 0) / hours.length : 0;
  // ciclo medio das playlists: quantas vezes um anuncio passa por dia em cada tela
  const cycles = screens.map((s) => s.items.reduce((a, it) => a + (it.media ? (it.media.active ? it.media.duration : 0) : it.group?.medias[0]?.media.duration ?? 0), 0)).filter((c) => c > 0);
  const cycle = cycles.length ? cycles.reduce((a, c) => a + c, 0) / cycles.length : 0;
  const insertions = cycle && hoursAvg ? (hoursAvg * 3600) / (cycle + 15) : 0; // com o anuncio novo de 15 s entrando na playlist
  const N = cfg.network;
  const pick = (typed: string, auto: string) => typed || auto;
  const numbers = {
    screens: pick(N.screens, String(screens.length)),
    cities: pick(N.cities, cities.join(', ')),
    citiesCount: N.cities ? N.cities.split(',').filter((x) => x.trim()).length : cities.length,
    peopleDay: pick(N.peopleDay, flowDay ? n(flowDay) : ''),
    peopleMonth: pick(N.peopleMonth, flowMonth ? n(flowMonth) : ''),
    segments: pick(N.segments, segments.join(', ')),
    segmentsCount: N.segments ? N.segments.split(',').filter((x) => x.trim()).length : segments.length,
    days: pick(N.days, days),
    hoursDay: pick(N.hoursDay, hoursAvg ? `${n(hoursAvg)} horas` : ''),
    insertionsDay: pick(N.insertionsDay, insertions ? `${n(insertions)} por tela` : ''),
    extra: N.extra.filter((x) => x.value && x.label),
  };
  return { screens: screens.map(({ items: _items, ...s }) => s), numbers };
}
export type FolderNumbers = Awaited<ReturnType<typeof folderData>>['numbers'];
