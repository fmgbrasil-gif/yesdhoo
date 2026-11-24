import { db } from './db';
import { localDate } from './util';

/** Gera avisos automaticos: telas offline ha mais de 48h e midias agendadas que expiraram. */
export async function refreshNotifications(tenantId: string) {
  const limit = new Date(Date.now() - 48 * 3600_000);
  const today = localDate();
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [offline, expired, fresh] = await Promise.all([
    db.screen.findMany({ where: { tenantId, deviceToken: { not: null }, lastSeenAt: { lt: limit } }, select: { id: true, name: true } }),
    db.media.findMany({ where: { tenantId, active: true, endDate: { lt: today, not: null } }, select: { id: true, name: true, endDate: true } }),
    db.media.findMany({ where: { tenantId: null, active: true, library: { not: null }, createdAt: { gte: weekAgo } }, select: { id: true, name: true, library: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  const rows = [
    ...offline.map((s) => ({ tenantId, key: `offline:${s.id}:${today}`, message: `A tela ${s.name} está offline há mais de 48h.`, link: `/telas/${s.id}` })),
    // um unico aviso para os conteudos novos da biblioteca (o mais recente define a chave)
    ...(fresh.length ? [{ tenantId, key: `novo:${fresh.map((m) => m.id).sort().join('').slice(0, 60)}`, message: `Tem conteúdo novo disponível no menu Conteúdos dinâmicos: ${fresh.slice(0, 3).map((m) => m.name).join(', ')}${fresh.length > 3 ? ` e mais ${fresh.length - 3}` : ''}.`, link: `/biblioteca?secao=${fresh[0].library}` }] : []),
    ...expired.map((m) => ({ tenantId, key: `expirada:${m.id}:${m.endDate}`, message: `A mídia agendada ${m.name} saiu do ar: o período definido terminou.`, link: `/midias/${m.id}` })),
  ];
  for (const r of rows) {
    await db.notification.upsert({ where: { tenantId_key: { tenantId, key: r.key } }, create: r, update: {} });
  }
}
