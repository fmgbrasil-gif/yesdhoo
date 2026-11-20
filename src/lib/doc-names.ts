import type { Client, Invoice } from '@prisma/client';

/** Nome curto do cliente para os arquivos: nome fantasia ou razao social. */
export const clientShort = (c: Pick<Client, 'name' | 'tradeName'>) => (c.tradeName || c.name).trim();
/** "11-2026" a partir da competencia (ou do vencimento). */
export const docMonth = (inv: Pick<Invoice, 'competence' | 'dueDate'>) => { const ym = inv.competence ?? inv.dueDate.slice(0, 7); return `${ym.slice(5, 7)}-${ym.slice(0, 4)}`; };

export const invoiceFileName = (inv: Pick<Invoice, 'competence' | 'dueDate'>, c: Pick<Client, 'name' | 'tradeName'>) => `Fatura ${clientShort(c)} ${docMonth(inv)}.pdf`;
export const pixFileName = (inv: Pick<Invoice, 'competence' | 'dueDate'>, c: Pick<Client, 'name' | 'tradeName'>) => `Pix ${clientShort(c)} ${docMonth(inv)}.pdf`;
export const contractFileName = (c: Pick<Client, 'name' | 'tradeName'>) => `Contrato ${clientShort(c)}.pdf`;
