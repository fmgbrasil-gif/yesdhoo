import { db } from './db';
import { localDate } from './util';

/**
 * Bloqueio automatico por inadimplencia.
 * Cada empresa alugada e um "cliente" dentro da conta da plataforma (billingClientId).
 * Se uma fatura desse cliente passar do vencimento por mais de `autoBlockDays` dias, a empresa e bloqueada;
 * quando nao houver mais faturas em atraso, um bloqueio automatico e desfeito sozinho.
 */
export async function enforceBilling(tenantId: string) {
  const t = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!t || t.isPlatform || !t.billingClientId || t.autoBlockDays == null) return t;
  const limit = localDate('America/Sao_Paulo', new Date(Date.now() - t.autoBlockDays * 86400_000));
  const overdue = await db.invoice.findFirst({
    where: { clientId: t.billingClientId, status: 'aberta', dueDate: { lt: limit } },
    orderBy: { dueDate: 'asc' },
  });
  if (overdue && t.status !== 'bloqueado') {
    return db.tenant.update({
      where: { id: t.id },
      data: { status: 'bloqueado', blockedAuto: true, blockedAt: new Date(), blockedReason: `Fatura nº ${overdue.number} vencida em ${overdue.dueDate.split('-').reverse().join('/')}.` },
    });
  }
  if (!overdue && t.status === 'bloqueado' && t.blockedAuto) {
    return db.tenant.update({ where: { id: t.id }, data: { status: 'ativo', blockedAuto: false, blockedAt: null, blockedReason: null } });
  }
  return t;
}

/** Depois que uma fatura da plataforma e paga, reavalia a empresa que ela cobra. */
export async function afterPlatformInvoiceChange(clientId: string) {
  const t = await db.tenant.findUnique({ where: { billingClientId: clientId } });
  if (t) await enforceBilling(t.id);
}

/** Tons da cor da marca para o painel (variaveis CSS usadas pelo Tailwind). */
export function brandCss(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const base = m ? m[1] : '8a52f8';
  const rgb = [0, 2, 4].map((i) => parseInt(base.slice(i, i + 2), 16));
  const mix = (t: number[], w: number) => rgb.map((c, i) => Math.round(c + (t[i] - c) * w));
  const white = [255, 255, 255], black = [0, 0, 0];
  const shades: Record<string, number[]> = {
    50: mix(white, 0.92), 100: mix(white, 0.78), 300: mix(white, 0.3), 400: rgb, 500: mix(black, 0.08), 600: mix(black, 0.22), 700: mix(black, 0.45),
  };
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const vars = Object.entries(shades).map(([k, v]) => `--brand-${k}: ${v.join(' ')};`).join(' ');
  // texto sobre a cor da marca: escuro em cores claras, branco em cores escuras
  return `:root { ${vars} --on-brand: ${lum > 0.6 ? '11 17 32' : '255 255 255'}; }`;
}
