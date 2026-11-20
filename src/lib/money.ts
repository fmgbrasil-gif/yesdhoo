const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtMoney = (cents: number | null | undefined) => BRL.format((cents ?? 0) / 100);

/** Converte "1.234,56", "1234.56" ou "1234" em centavos. Devolve null se nao for um valor valido. */
export function parseMoney(v: string | null | undefined) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Valor em centavos para preencher um campo de formulario ("1234,56"). */
export const moneyInput = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','));

export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
