import { XMLParser } from 'fast-xml-parser';
import { db } from '@/lib/db';
import { cached, isPublicUrl, screenFromRequest, unauthorized } from '@/lib/player';

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

/** Dados dos conteudos dinamicos: manchetes RSS, cotacao do dolar e previsao do tempo. */
export async function GET(req: Request) {
  const screen = await screenFromRequest(req);
  if (!screen) return unauthorized();
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');

  if (kind === 'rss') {
    const media = await db.media.findFirst({ where: { id: q.get('id') ?? '', type: 'rss', OR: [{ tenantId: screen.tenantId }, { tenantId: null }] } });
    if (!media?.url || !isPublicUrl(media.url)) return Response.json({ items: [] });
    return Response.json({ items: (await cached(`rss:${media.url}`, 30, () => loadFeed(media.url!))) ?? [] });
  }
  if (kind === 'dolar') {
    const data = await cached('dolar', 30, async () => {
      const j = await (await get('https://economia.awesomeapi.com.br/json/last/USD-BRL')).json();
      const v = Number(j?.USDBRL?.bid);
      if (!Number.isFinite(v)) throw new Error('cotacao');
      return { value: v, change: Number(j.USDBRL.pctChange) || 0 };
    });
    return Response.json(data ?? {});
  }
  if (kind === 'clima') {
    if (screen.latitude == null || screen.longitude == null) return Response.json({});
    const { latitude: la, longitude: lo } = screen;
    const data = await cached(`clima:${la.toFixed(2)},${lo.toFixed(2)}`, 30, async () => {
      const j = await (await get(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)).json();
      if (typeof j?.current?.temperature_2m !== 'number') throw new Error('clima');
      return { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code as number, max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]), city: screen.city };
    });
    return Response.json(data ?? {});
  }
  return Response.json({ error: 'Tipo desconhecido.' }, { status: 400 });
}
