import { getUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { widgetData } from '@/lib/widget-data';

/** Dados dos conteudos dinamicos para a previa no painel (clima: local da primeira tela com mapa). */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Faça login.' }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const screen = await db.screen.findFirst({ where: { ...screenScope(user), latitude: { not: null }, longitude: { not: null } }, select: { latitude: true, longitude: true, city: true }, orderBy: { createdAt: 'asc' } });
  const data = await widgetData(q.get('kind'), q.get('id') ?? '', { tenantId: user.tenantId, latitude: screen?.latitude ?? null, longitude: screen?.longitude ?? null, city: screen?.city ?? null });
  return data ? Response.json(data) : Response.json({ error: 'Tipo desconhecido.' }, { status: 400 });
}
