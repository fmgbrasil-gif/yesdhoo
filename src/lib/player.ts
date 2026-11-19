import { db } from './db';

export async function screenFromRequest(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return db.screen.findUnique({ where: { deviceToken: token } });
}

export const unauthorized = () => Response.json({ error: 'Dispositivo não pareado.' }, { status: 401 });

/** Limpa as informacoes enviadas pelo dispositivo antes de gravar. */
export function cleanInfo(info: unknown) {
  const out: Record<string, string | number> = {};
  if (info && typeof info === 'object') {
    for (const k of ['model', 'os', 'app', 'resolution', 'storageUsed'] as const) {
      const v = (info as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      else if (typeof v === 'string') out[k] = v.slice(0, 120);
    }
  }
  return JSON.stringify(out);
}

const cache = new Map<string, { at: number; data: unknown }>();
/** Cache em memoria para dados externos (noticias, clima, cotacao). */
export async function cached<T>(key: string, ttlMin: number, load: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMin * 60_000) return hit.data as T;
  try {
    const data = await load();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return (hit?.data as T) ?? null; // em caso de falha, serve o ultimo valor conhecido
  }
}

/** Bloqueia enderecos internos ao buscar URLs informadas pelo usuario (feeds RSS). */
export function isPublicUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') || h.includes(':')) return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}
