import { ONLINE_WINDOW_MIN } from './constants';

export function isOnline(lastSeenAt: Date | null | undefined) {
  return !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MIN * 60_000;
}

export function onlineCutoff() {
  return new Date(Date.now() - ONLINE_WINDOW_MIN * 60_000);
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return 'nunca';
  const s = Math.round((new Date(d).getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return 'agora mesmo';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
}

export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtBytes(b?: number | null) {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export const fmtInt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

/** Data local (YYYY-MM-DD) em um fuso horario. */
export function localDate(tz = 'America/Sao_Paulo', d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function lastDays(n: number, tz = 'America/Sao_Paulo') {
  return Array.from({ length: n }, (_, i) => localDate(tz, new Date(Date.now() - (n - 1 - i) * 86400_000)));
}

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function pairingCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
export function num(fd: FormData, k: string) {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
export const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === '1' || fd.get(k) === 'true';

export function youtubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
