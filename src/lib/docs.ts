import extenso from 'extenso';

/** 12345678000190 -> 12.345.678/0001-90 ; 12345678909 -> 123.456.789-09 */
export function fmtDoc(doc?: string | null) {
  const d = (doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc ?? '';
}

export const fmtCep = (cep?: string | null) => { const d = (cep ?? '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep ?? ''; };

/** Valor em reais por extenso, em maiusculas (mesma biblioteca do G-Faturas). */
export const moneyInWords = (cents: number) => extenso((cents / 100).toFixed(2).replace('.', ','), { mode: 'currency', currency: { type: 'BRL' } }).toUpperCase();

export function addressLine(a: { road?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null }) {
  return [[a.road, a.number].filter(Boolean).join(', '), a.complement, a.neighborhood].filter(Boolean).join(' - ');
}
