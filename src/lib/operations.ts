import 'server-only';
import { db } from './db';
import type { ScreenOpt } from '@/components/OperationFields';

/** Telas da empresa no formato da lista de pontos das operacoes. */
export async function screenOptions(tenantId: string): Promise<ScreenOpt[]> {
  const screens = await db.screen.findMany({ where: { tenantId }, select: { id: true, name: true, city: true, state: true, neighborhood: true }, orderBy: { name: 'asc' } });
  return screens.map((s) => ({ id: s.id, name: s.name, place: [s.neighborhood, s.city && `${s.city}${s.state ? '/' + s.state : ''}`].filter(Boolean).join(' · ') }));
}

