import { getUser } from '@/lib/auth';
import { playReport } from '@/lib/report';

const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Exporta o relatorio de exibicoes (por midia) em CSV, pronto para enviar ao anunciante. */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response('Não autorizado', { status: 401 });
  const r = await playReport(user, Object.fromEntries(new URL(req.url).searchParams));
  const lines = [
    ['Mídia', 'Cliente', 'Exibições', 'Tempo no ar (s)', 'Telas', 'De', 'Até'],
    ...r.medias.map((m) => [m.name, m.client, m.count, m.seconds, m.screens, r.start, r.end]),
  ];
  const csv = '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="exibicoes-${r.start}-a-${r.end}.csv"` } });
}
