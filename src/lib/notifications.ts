import { db } from './db';
import { localDate } from './util';

/** Gera avisos automaticos: telas offline ha mais de 48h e midias agendadas que expiraram. */
export async function refreshNotifications(tenantId: string) {
  const limit = new Date(Date.now() - 48 * 3600_000);
  const today = localDate();
  const [offline, expired] = await Promise.all([
    db.screen.findMany({ where: { tenantId, deviceToken: { not: null }, lastSeenAt: { lt: limit } }, select: { id: true, name: true } }),
    db.media.findMany({ where: { tenantId, active: true, endDate: { lt: today, not: null } }, select: { id: true, name: true, endDate: true } }),
  ]);
  const rows = [
    ...offline.map((s) => ({ tenantId, key: `offline:${s.id}:${today}`, message: `A tela ${s.name} está offline há mais de 48h.`, link: `/telas/${s.id}` })),
    ...expired.map((m) => ({ tenantId, key: `expirada:${m.id}:${m.endDate}`, message: `A mídia agendada ${m.name} saiu do ar: o período definido terminou.`, link: `/midias/${m.id}` })),
  ];
  for (const r of rows) {
    await db.notification.upsert({ where: { tenantId_key: { tenantId, key: r.key } }, create: r, update: {} });
  }
}
