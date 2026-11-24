import { db } from '@/lib/db';

/** Consulta leve (a cada ~20 s): ha comando pendente ou playlist nova? Se sim, o player faz o batimento na hora. */
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'Dispositivo não pareado.' }, { status: 401 });
  const screen = await db.screen.findUnique({ where: { deviceToken: token }, select: { id: true, playlistVersion: true } });
  if (!screen) return Response.json({ error: 'Dispositivo não pareado.' }, { status: 401 });
  const pending = await db.command.count({ where: { screenId: screen.id, status: 'pendente' } });
  return Response.json({ pending, version: screen.playlistVersion }, { headers: { 'Cache-Control': 'no-store' } });
}
