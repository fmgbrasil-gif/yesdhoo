import { db } from './db';
import { MEDIA_TYPES } from './constants';

export type PlaylistRow = {
  slot: number; // posicao na playlist (grupo = um lugar, com as midias em rodizio)
  id: string; name: string; client: string | null; type: string; typeLabel: string; kind: string | null;
  duration: number; fileH: string | null; fileV: string | null; startDate: string | null; endDate: string | null;
  group: string | null; groupSize: number; active: boolean;
};

/** Playlist da tela "aberta": cada midia, e os grupos com suas midias (que se revezam no mesmo lugar). */
export async function screenPlaylist(screenId: string): Promise<PlaylistRow[]> {
  const items = await db.playlistItem.findMany({
    where: { screenId }, orderBy: { position: 'asc' },
    include: {
      media: { include: { client: { select: { name: true } } } },
      group: { include: { medias: { orderBy: { position: 'asc' }, include: { media: { include: { client: { select: { name: true } } } } } } } },
    },
  });
  const rows: PlaylistRow[] = [];
  items.forEach((it, slot) => {
    const list = it.media ? [{ m: it.media, group: null as string | null, size: 1 }] : (it.group?.medias ?? []).map((gm) => ({ m: gm.media, group: it.group!.name, size: it.group!.medias.length }));
    for (const { m, group, size } of list) {
      rows.push({
        slot: slot + 1, id: m.id, name: m.name, client: m.client?.name ?? (m.tenantId ? null : 'Biblioteca'), type: m.type,
        typeLabel: m.type === 'arquivo' ? (m.kind === 'video' ? 'Vídeo' : 'Imagem') : MEDIA_TYPES[m.type] ?? m.type, kind: m.kind,
        duration: m.duration, fileH: m.fileH, fileV: m.fileV, startDate: m.startDate, endDate: m.endDate, group, groupSize: size, active: m.active,
      });
    }
  });
  return rows;
}

/** Tempo de um ciclo completo da playlist (cada lugar conta uma vez; grupo usa a media das suas midias). */
export function cycleSeconds(rows: PlaylistRow[]) {
  const bySlot = new Map<number, number[]>();
  for (const r of rows.filter((x) => x.active)) bySlot.set(r.slot, [...(bySlot.get(r.slot) ?? []), r.duration]);
  return [...bySlot.values()].reduce((a, d) => a + d.reduce((x, y) => x + y, 0) / d.length, 0);
}
