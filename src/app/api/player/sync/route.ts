import { db } from '@/lib/db';
import { isCompatible, mediaForPlayer } from '@/lib/playables';
import { screenFromRequest, unauthorized } from '@/lib/player';

/** Entrega a configuracao da tela e a playlist resolvida. Cada posicao e uma lista: grupos alternam suas midias a cada ciclo. */
export async function GET(req: Request) {
  const screen = await screenFromRequest(req);
  if (!screen) return unauthorized();
  const items = await db.playlistItem.findMany({
    where: { screenId: screen.id }, orderBy: { position: 'asc' },
    include: {
      media: { include: { client: { select: { active: true } } } },
      group: { include: { medias: { include: { media: { include: { client: { select: { active: true } } } } }, orderBy: { position: 'asc' } } } },
    },
  });
  // midia inativa, de cliente/parceiro desativado ou sem arquivo na orientacao da tela nao vai ao ar
  const ok = (m: { active: boolean; client: { active: boolean } | null } & Parameters<typeof isCompatible>[0]) => m.active && m.client?.active !== false && isCompatible(m, screen.orientation);
  const slots = items
    .map((it) => (it.media ? [it.media] : it.group?.active ? it.group.medias.map((g) => g.media) : []).filter(ok).map((m) => mediaForPlayer(m, screen.orientation)))
    .filter((s) => s.length);
  await db.screen.update({ where: { id: screen.id }, data: { syncedAt: new Date(), syncedVersion: screen.playlistVersion, lastSeenAt: new Date() } });
  return Response.json({
    version: screen.playlistVersion,
    screen: {
      name: screen.name, orientation: screen.orientation, timezone: screen.timezone, updateFrequency: screen.updateFrequency, audioEnabled: screen.audioEnabled,
      footer: screen.footerEnabled ? { text: screen.footerText, bg: screen.footerBg, color: screen.footerColor, clock: screen.footerClock, weather: screen.footerWeather } : null,
    },
    slots,
  });
}
