import { db } from '@/lib/db';
import { cleanInfo, screenFromRequest, unauthorized } from '@/lib/player';
import { localDate } from '@/lib/util';
import { saveFile, removeFile } from '@/lib/storage';

/**
 * Batimento do player (a cada ~1 min): marca a tela como online, soma tempo no ar,
 * grava as exibicoes do intervalo, confirma comandos executados e devolve os pendentes.
 */
export async function POST(req: Request) {
  const screen = await screenFromRequest(req);
  if (!screen) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const date = localDate(screen.timezone, now);

  // soma os minutos desde o ultimo batimento, se a tela nao ficou fora do ar nesse meio tempo
  const gapMin = screen.lastSeenAt ? (now.getTime() - screen.lastSeenAt.getTime()) / 60_000 : 99;
  if (gapMin >= 0.5 && gapMin <= 3) {
    await db.screenUptime.upsert({ where: { screenId_date: { screenId: screen.id, date } }, create: { screenId: screen.id, date, minutes: Math.round(gapMin) }, update: { minutes: { increment: Math.round(gapMin) } } });
  }

  const plays = body.plays && typeof body.plays === 'object' ? (Object.entries(body.plays) as [string, unknown][]) : [];
  if (plays.length) {
    const valid = new Set((await db.media.findMany({ where: { id: { in: plays.map(([id]) => id) }, OR: [{ tenantId: screen.tenantId }, { tenantId: null }] }, select: { id: true } })).map((m) => m.id));
    for (const [mediaId, n] of plays) {
      const count = Math.min(500, Math.max(0, Math.floor(Number(n)) || 0));
      if (!valid.has(mediaId) || !count) continue;
      await db.playStat.upsert({ where: { screenId_mediaId_date: { screenId: screen.id, mediaId, date } }, create: { screenId: screen.id, mediaId, date, count }, update: { count: { increment: count } } });
    }
  }

  if (Array.isArray(body.executed) && body.executed.length) {
    await db.command.updateMany({ where: { screenId: screen.id, id: { in: body.executed.map(String) } }, data: { status: 'executado', executedAt: now } });
  }

  const data: Record<string, unknown> = { lastSeenAt: now };
  if (body.info) data.deviceInfo = cleanInfo(body.info);
  if (typeof body.screenshot === 'string' && body.screenshot.startsWith('data:image/jpeg;base64,') && body.screenshot.length < 1_500_000) {
    const file = new File([Buffer.from(body.screenshot.split(',')[1], 'base64')], 'captura.jpg', { type: 'image/jpeg' });
    await removeFile(screen.screenshot);
    data.screenshot = await saveFile(file, 'capturas');
    data.screenshotAt = now;
  }
  await db.screen.update({ where: { id: screen.id }, data });

  const commands = await db.command.findMany({ where: { screenId: screen.id, status: 'pendente' }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true } });
  return Response.json({ version: screen.playlistVersion, commands });
}
