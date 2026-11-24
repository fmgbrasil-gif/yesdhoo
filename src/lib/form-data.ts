import { db } from './db';
import { screenScope, type SessionUser } from './auth';
import { ORIENTATIONS } from './constants';
import { REMOTE } from './storage';
import type { MediaFormData } from '@/components/MediaForm';

/** Opcoes compartilhadas pelos formularios de conteudo. */
export async function mediaFormData(user: SessionUser): Promise<MediaFormData> {
  const [clients, categories, screens, ops] = await Promise.all([
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.screen.findMany({ where: screenScope(user), orderBy: { name: 'asc' }, select: { id: true, name: true, orientation: true } }),
    db.operation.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { name: true, screens: { where: screenScope(user), select: { id: true } } } }),
  ]);
  return { remote: REMOTE, clients, categories, screens: screens.map((s) => ({ id: s.id, label: s.name, sub: ORIENTATIONS[s.orientation as 'H' | 'V'] })), operations: ops.map((o) => ({ label: o.name, ids: o.screens.map((x) => x.id) })) };
}
