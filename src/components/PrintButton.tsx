'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ className = '' }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`inline-flex items-center gap-2 rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-ink-700 print:hidden ${className}`}>
      <Printer size={16} /> Imprimir / PDF
    </button>
  );
}
