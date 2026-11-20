/**
 * Integracao com o Asaas (API v3) para boletos.
 * Documentacao: https://docs.asaas.com/reference/criar-nova-cobranca
 */
export type AsaasEnv = 'sandbox' | 'producao';

const BASE: Record<AsaasEnv, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

export class BankError extends Error {}

async function call<T>(env: AsaasEnv, apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE[env] + path, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: { access_token: apiKey, 'Content-Type': 'application/json', 'User-Agent': 'YesDOOH/1.0', ...(init.headers ?? {}) },
    });
  } catch {
    throw new BankError('O banco não respondeu. Tente de novo em instantes.');
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (res.status === 401) throw new BankError('O banco recusou a chave de acesso. Confira a chave da API e o ambiente (teste ou produção).');
    const msg = Array.isArray(json?.errors) ? json.errors.map((e: { description?: string }) => e.description).filter(Boolean).join(' ') : '';
    throw new BankError(msg || `O banco devolveu um erro (${res.status}).`);
  }
  return json as T;
}

export type AsaasPayment = { id: string; status: string; value: number; bankSlipUrl?: string; invoiceUrl?: string; paymentDate?: string; clientPaymentDate?: string };

/** Status do Asaas que indicam cobranca paga. */
export const PAID_STATUSES = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

export const asaas = {
  /** Testa a chave consultando a conta. */
  ping: (env: AsaasEnv, apiKey: string) => call<{ totalCount?: number }>(env, apiKey, '/customers?limit=1'),

  createCustomer: (env: AsaasEnv, apiKey: string, c: { name: string; cpfCnpj: string; email?: string | null; phone?: string | null; externalReference: string }) =>
    call<{ id: string }>(env, apiKey, '/customers', {
      method: 'POST',
      body: JSON.stringify({ name: c.name, cpfCnpj: c.cpfCnpj, email: c.email || undefined, mobilePhone: c.phone || undefined, externalReference: c.externalReference, notificationDisabled: true }),
    }),

  createBoleto: (env: AsaasEnv, apiKey: string, p: { customer: string; valueCents: number; dueDate: string; description: string; externalReference: string }) =>
    call<AsaasPayment>(env, apiKey, '/payments', {
      method: 'POST',
      body: JSON.stringify({ customer: p.customer, billingType: 'BOLETO', value: p.valueCents / 100, dueDate: p.dueDate, description: p.description.slice(0, 500), externalReference: p.externalReference }),
    }),

  identificationField: (env: AsaasEnv, apiKey: string, id: string) =>
    call<{ identificationField: string; nossoNumero?: string; barCode?: string }>(env, apiKey, `/payments/${encodeURIComponent(id)}/identificationField`),

  pixQrCode: (env: AsaasEnv, apiKey: string, id: string) =>
    call<{ payload: string; encodedImage?: string; expirationDate?: string }>(env, apiKey, `/payments/${encodeURIComponent(id)}/pixQrCode`),

  getPayment: (env: AsaasEnv, apiKey: string, id: string) => call<AsaasPayment>(env, apiKey, `/payments/${encodeURIComponent(id)}`),

  deletePayment: (env: AsaasEnv, apiKey: string, id: string) =>
    call<{ deleted: boolean }>(env, apiKey, `/payments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
