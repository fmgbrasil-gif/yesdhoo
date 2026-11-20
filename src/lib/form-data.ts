import { db } from './db';
import { screenScope, type SessionUser } from './auth';
import { ORIENTATIONS } from './constants';
import { REMOTE } from './storage';
import type { MediaFormData } from '@/components/MediaForm';

/** Opcoes compartilhadas pelos formularios de conteudo. */
export async function mediaFormData(user: SessionUser): Promise<MediaFormData> {
  const [clients, categories, screens] = await Promise.all([
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.screen.findMany({ where: screenScope(user), orderBy: { name: 'asc' }, select: { id: true, name: true, orientation: true } }),
  ]);
  return { remote: REMOTE, clients, categories, screens: screens.map((s) => ({ id: s.id, label: s.name, sub: ORIENTATIONS[s.orientation as 'H' | 'V'] })) };
}
