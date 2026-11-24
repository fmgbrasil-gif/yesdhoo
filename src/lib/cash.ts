import { db } from './db';

export const ACCOUNT_KINDS: Record<string, string> = { caixa: 'Caixa (dinheiro)', banco: 'Conta bancária', carteira: 'Carteira digital' };
export const PAYABLE_CATEGORIES = ['Aluguel', 'Energia elétrica', 'Internet e telefone', 'Salários e pró-labore', 'Impostos e taxas', 'Fornecedores', 'Equipamentos e telas', 'Manutenção', 'Comissão de parceiros', 'Marketing', 'Contabilidade', 'Combustível e transporte', 'Tarifas bancárias', 'Outros'];
export const ENTRY_CATEGORIES = ['Recebimento de cliente', 'Aporte', 'Empréstimo', 'Rendimento', 'Ajuste de saldo', 'Outros'];

/** Saldo de cada conta (saldo inicial + entradas - saidas), opcionalmente ate uma data. */
export async function balances(tenantId: string, until?: string) {
  const accounts = await db.bankAccount.findMany({ where: { tenantId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const sums = await db.cashEntry.groupBy({ by: ['accountId', 'kind'], where: { tenantId, ...(until ? { date: { lte: until } } : {}) }, _sum: { amountCents: true } });
  const of = (id: string, kind: string) => sums.find((s) => s.accountId === id && s.kind === kind)?._sum.amountCents ?? 0;
  return accounts.map((a) => ({ ...a, balanceCents: a.initialCents + of(a.id, 'entrada') - of(a.id, 'saida') }));
}

/** Conta padrao da empresa (para baixas automaticas); se nao houver, a primeira ativa. */
export async function defaultAccountId(tenantId: string) {
  const a = await db.bankAccount.findFirst({ where: { tenantId, active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  return a?.id ?? null;
}

/** Recebimento de fatura vira entrada no extrato (substitui o lancamento anterior da mesma fatura). */
export async function recordInvoicePayment(inv: { id: string; tenantId: string; number: number; paidCents: number | null; amountCents: number; paidAt: Date | null; clientName: string; operationId?: string | null; accountId?: string | null }, accountId?: string | null) {
  await db.cashEntry.deleteMany({ where: { invoiceId: inv.id } });
  // prioridade: conta escolhida na baixa > caixa da fatura > caixa da operacao > conta padrao
  const pick = accountId || inv.accountId;
  const acc = pick ? await db.bankAccount.findFirst({ where: { id: pick, tenantId: inv.tenantId, active: true } }) : null;
  const opAcc = !acc && inv.operationId ? (await db.operation.findFirst({ where: { id: inv.operationId }, select: { account: { select: { id: true, active: true } } } }))?.account : null;
  const id = acc?.id ?? (opAcc?.active ? opAcc.id : null) ?? (await defaultAccountId(inv.tenantId));
  if (!id) return; // empresa ainda sem contas correntes cadastradas
  const date = (inv.paidAt ?? new Date()).toISOString().slice(0, 10);
  await db.cashEntry.create({ data: { tenantId: inv.tenantId, accountId: id, date, kind: 'entrada', amountCents: inv.paidCents ?? inv.amountCents, description: `Fatura nº ${inv.number} — ${inv.clientName}`, category: 'Recebimento de cliente', invoiceId: inv.id } });
}

export const removeInvoicePayment = (invoiceId: string) => db.cashEntry.deleteMany({ where: { invoiceId } });

/** Conta sugerida para receber uma fatura: a da operacao dela; senao a padrao. */
export function suggestedAccount(inv: { accountId?: string | null; operation?: { accountId: string | null } | null }, accounts: { id: string }[]) {
  for (const id of [inv.accountId, inv.operation?.accountId]) if (id && accounts.some((a) => a.id === id)) return id;
  return accounts[0]?.id ?? '';
}
