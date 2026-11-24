import 'server-only';
import { XMLParser } from 'fast-xml-parser';
import { db } from '@/lib/db';
import { cached, isPublicUrl } from '@/lib/player';
import { parseJson } from '@/lib/util';

const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DOOH-Player/1.0)' } });
const text = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String((v as { '#text': unknown })['#text']) : '');
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function loadFeed(url: string) {
  const res = await get(url);
  if (!res.ok) throw new Error('feed');
  const xml = (await res.text()).slice(0, 2_000_000);
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  return (Array.isArray(raw) ? raw : [raw]).slice(0, 15).map((it: Record<string, unknown>) => {
    const media = (it['media:content'] ?? it['media:thumbnail'] ?? it.enclosure) as Record<string, string> | Record<string, string>[] | undefined;
    const first = Array.isArray(media) ? media[0] : media;
    const inline = String(text(it.description) || text(it['content:encoded'])).match(/<img[^>]+src="([^"]+)"/)?.[1];
    return { title: strip(text(it.title)), summary: strip(text(it.description) || text(it.summary)).slice(0, 220), image: first?.['@url'] ?? inline ?? null };
  }).filter((i) => i.title);
}

export type WidgetPlace = { tenantId: string; latitude: number | null; longitude: number | null; city: string | null };

/** Dados dos conteudos dinamicos: manchetes RSS, cotacao do dolar e previsao do tempo (para o player e a previa do painel). */
export async function widgetData(kind: string | null, id: string, place: WidgetPlace): Promise<Record<string, unknown> | null> {
  if (kind === 'rss') {
    const media = await db.media.findFirst({ where: { id, type: 'rss', OR: [{ tenantId: place.tenantId }, { tenantId: null }] } });
    if (!media?.url || !isPublicUrl(media.url)) return { items: [] };
    return { items: (await cached(`rss:${media.url}`, 30, () => loadFeed(media.url!))) ?? [] };
  }
  if (kind === 'dolar') {
    const data = await cached('dolar', 30, async () => {
      const j = await (await get('https://economia.awesomeapi.com.br/json/last/USD-BRL')).json();
      const v = Number(j?.USDBRL?.bid);
      if (!Number.isFinite(v)) throw new Error('cotacao');
      return { value: v, change: Number(j.USDBRL.pctChange) || 0 };
    });
    return data ?? {};
  }
  if (kind === 'clima') {
    // cidade fixa na midia (ex.: Igarapava/SP) ou, sem ela, a localizacao de cada tela
    const media = id ? await db.media.findFirst({ where: { id, type: 'clima', OR: [{ tenantId: place.tenantId }, { tenantId: null }] } }) : null;
    const cfg = parseJson<{ city?: string; lat?: number; lon?: number }>(media?.config, {});
    const fixed = typeof cfg.lat === 'number' && typeof cfg.lon === 'number';
    const la = fixed ? cfg.lat! : place.latitude;
    const lo = fixed ? cfg.lon! : place.longitude;
    if (la == null || lo == null) return {};
    const city = fixed ? cfg.city ?? null : place.city;
    const data = await cached(`clima4:${la.toFixed(2)},${lo.toFixed(2)}`, 30, async () => {
      const j = await (await get(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=4`)).json();
      if (typeof j?.current?.temperature_2m !== 'number') throw new Error('clima');
      const d = j.daily;
      const days = (d.time as string[]).map((date, i) => ({ date, code: d.weather_code[i] as number, max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: Number(d.precipitation_probability_max?.[i] ?? 0) }));
      return { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code as number, max: days[0].max, min: days[0].min, rain: days[0].rain, days };
    });
    return data ? { ...data, city } : {};
  }
  return null;
}
