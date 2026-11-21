import { screenFromRequest, unauthorized } from '@/lib/player';
import { widgetData } from '@/lib/widget-data';

/** Dados dos conteudos dinamicos para o player da tela. */
export async function GET(req: Request) {
  const screen = await screenFromRequest(req);
  if (!screen) return unauthorized();
  const q = new URL(req.url).searchParams;
  const data = await widgetData(q.get('kind'), q.get('id') ?? '', screen);
  return data ? Response.json(data) : Response.json({ error: 'Tipo desconhecido.' }, { status: 400 });
}
