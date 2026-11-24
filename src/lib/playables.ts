import type { Media, MediaGroup } from '@prisma/client';
import { fileUrl } from './storage';
import { parseJson, youtubeId } from './util';

export type Playable = {
  key: string; // "m:<id>" ou "g:<id>"
  id: string;
  isGroup: boolean;
  name: string;
  sub: string;
  type: string;
  section: string;
  duration: number;
  thumb: string | null;
  compatible: boolean;
  /** Motivo de nao poder tocar nesta tela (quando compatible = false). */
  reason?: string | null;
  period: string | null;
  endIso?: string | null;
  count?: number;
  /** dados para a previa (Visualizar) antes de escolher */
  preview?: { h: PlayerMedia; v: PlayerMedia } | null;
};

type MediaWithClient = Media & { client?: { name: string; active?: boolean } | null };

export function mediaThumb(m: Media) {
  if (m.thumb) return fileUrl(m.thumb);
  if (m.kind === 'image') return fileUrl(m.fileH || m.fileV);
  if (m.type === 'youtube' && m.url) { const id = youtubeId(m.url); return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null; }
  return null;
}

export function mediaSection(m: Media) {
  if (m.library) return m.library === 'noticias' ? 'noticias' : 'biblioteca';
  if (m.type === 'aviso') return 'avisos';
  if (m.type === 'rss') return 'rss';
  if (['hora', 'dolar', 'clima'].includes(m.type)) return 'utilitarios';
  return 'midias';
}

/** Uma midia de arquivo so toca em telas da mesma orientacao do arquivo enviado. */
export function isCompatible(m: Media, orientation: string) {
  if (m.type !== 'arquivo') return true;
  return orientation === 'V' ? !!m.fileV : !!m.fileH;
}

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Explica por que a midia nao toca na tela (ou null se toca). */
export function incompatibleReason(m: MediaWithClient, orientation: string) {
  if (m.client?.active === false) return 'Cliente desativado';
  if (isCompatible(m, orientation)) return null;
  return orientation === 'V' ? 'Só tem arquivo horizontal — envie a versão vertical (1080×1920)' : 'Só tem arquivo vertical — envie a versão horizontal (1920×1080)';
}

export function mediaToPlayable(m: MediaWithClient, orientation: string): Playable {
  return {
    key: `m:${m.id}`, id: m.id, isGroup: false, name: m.name, sub: m.client ? (m.client.active === false ? `${m.client.name} (desativado)` : m.client.name) : m.library ? 'Biblioteca' : 'Avulso', type: m.type, section: mediaSection(m),
    duration: m.duration, thumb: mediaThumb(m), compatible: isCompatible(m, orientation) && m.client?.active !== false, reason: incompatibleReason(m, orientation),
    period: m.startDate || m.endDate ? `${m.startDate ? br(m.startDate) : '…'} a ${m.endDate ? br(m.endDate) : '…'}` : null,
    endIso: m.endDate,
    preview: { h: mediaForPlayer(m, 'H'), v: mediaForPlayer(m, 'V') },
  };
}

export function groupToPlayable(g: MediaGroup & { medias: { media: Media }[] }): Playable {
  return {
    key: `g:${g.id}`, id: g.id, isGroup: true, name: g.name, sub: `${g.medias.length} mídia(s) em rodízio`, type: 'grupo', section: 'grupos',
    duration: g.medias[0]?.media.duration ?? 0, thumb: fileUrl(g.image) ?? (g.medias[0] ? mediaThumb(g.medias[0].media) : null), compatible: true, period: null, count: g.medias.length,
    preview: g.medias[0] ? { h: mediaForPlayer(g.medias[0].media, 'H'), v: mediaForPlayer(g.medias[0].media, 'V') } : null,
  };
}

/** Formato entregue ao player. */
export function mediaForPlayer(m: Media, orientation: string) {
  const file = orientation === 'V' ? m.fileV : m.fileH;
  return {
    id: m.id, name: m.name, type: m.type, kind: m.kind, duration: m.duration, src: fileUrl(file), url: m.url, config: parseJson<Record<string, unknown>>(m.config, {}),
    storeStats: m.storeStats, startDate: m.startDate, endDate: m.endDate, shiftStart: m.shiftStart, shiftEnd: m.shiftEnd, weekDays: m.weekDays,
  };
}
export type PlayerMedia = ReturnType<typeof mediaForPlayer>;
