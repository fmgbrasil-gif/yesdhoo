'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-dark print:hidden" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2500); } catch { /* sem acesso a area de transferencia: o texto continua selecionavel */ }
    }}>{done ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> {label}</>}</button>
  );
}
