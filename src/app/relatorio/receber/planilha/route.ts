import { getUser } from '@/lib/auth';
import { fmtDate } from '@/lib/money';
import { fmtDoc } from '@/lib/docs';
import { openDebts } from '@/lib/receivables';
import { localDate } from '@/lib/util';

const cell = (v: string | number) => { const s = String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const brl = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** Planilha (CSV para Excel, separador ;) dos debitos em aberto. */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return new Response('Faça login como administrador.', { status: 401 });
  const q = new URL(req.url).searchParams;
  const { list } = await openDebts(user.tenantId, { cliente: q.get('cliente') ?? undefined, operacao: q.get('operacao') ?? undefined, situacao: q.get('situacao') ?? undefined, ate: q.get('ate') ?? undefined, futuras: q.get('futuras') ?? undefined });
  const rows = [['Cliente', 'CPF/CNPJ', 'Telefone', 'Fatura', 'Referência', 'Operação', 'Vencimento', 'Dias de atraso', 'Valor (R$)']];
  for (const g of list) for (const i of g.items) rows.push([g.client.name, fmtDoc(g.client.document), g.client.phone1 ?? '', String(i.number).padStart(6, '0'), i.ref, i.operation ?? '', fmtDate(i.dueDate), String(i.late), brl(i.amountCents)]);
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="debitos-em-aberto-${localDate()}.csv"` } });
}
