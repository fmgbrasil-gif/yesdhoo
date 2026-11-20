import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { runRecurring } from '@/lib/billing';
import { enforceBilling } from '@/lib/tenant';

/**
 * Rotina diaria (Vercel Cron): gera as faturas das cobrancas recorrentes de todas as empresas
 * e aplica o bloqueio automatico por atraso. A Vercel envia "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  if (!secret || sent.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(want))) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const result = await runRecurring();
  const tenants = await db.tenant.findMany({ where: { isPlatform: false, autoBlockDays: { not: null } }, select: { id: true } });
  for (const t of tenants) await enforceBilling(t.id);
  return Response.json({ ok: true, ...result, checkedTenants: tenants.length });
}
