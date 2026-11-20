'use client';

import { useState } from 'react';

/** Formata centavos como "1.234,56". */
export const centsToText = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Os digitos digitados entram pela direita: 1 -> 0,01; 15 -> 0,15; 150000 -> 1.500,00. */
export function maskMoney(raw: string) {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
  return centsToText(Number(digits || '0'));
}

/** Campo de valor em reais com a casa dos centavos ja definida. Envia o valor como "1.234,56". */
export function MoneyInput({ name, defaultCents, value, onChange, className = 'input', id, required, label }: {
  name?: string; defaultCents?: number | null; value?: string; onChange?: (v: string) => void; className?: string; id?: string; required?: boolean; label?: string;
}) {
  const [inner, setInner] = useState(centsToText(defaultCents ?? 0));
  const v = value ?? inner;
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">R$</span>
      <input id={id} name={name} inputMode="numeric" aria-label={label} required={required} value={v}
        onChange={(e) => { const m = maskMoney(e.target.value); if (onChange) onChange(m); else setInner(m); }}
        onFocus={(e) => e.currentTarget.select()}
        className={`${className} pl-9 text-right tabular-nums`} />
    </span>
  );
}
