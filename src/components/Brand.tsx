'use client';

import { useState } from 'react';

/** Logo da desenvolvedora. Se a imagem nao estiver disponivel, mostra o nome em texto. */
export function DevCredit({ className = '', dark }: { className?: string; dark?: boolean }) {
  const [img, setImg] = useState(true);
  return (
    <a href="#" onClick={(e) => e.preventDefault()} className={`inline-flex items-center gap-2 text-[11px] ${dark ? 'text-ink-400' : 'text-ink-400'} ${className}`} aria-label="Desenvolvido por Imperium X">
      <span>Desenvolvido por</span>
      {img
        ? <img src="/brand/imperiumx.png" alt="Imperium X" className="h-5 w-auto object-contain" onError={() => setImg(false)} /> /* eslint-disable-line @next/next/no-img-element */
        : <b className={dark ? 'text-ink-200' : 'text-ink-600'}>Imperium X</b>}
    </a>
  );
}

/** Marca d'agua: a logo da empresa bem suave no centro da area de trabalho, sem bloquear cliques. */
export function Watermark({ src }: { src: string | null }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center print:hidden lg:left-64">
      <img src={src} alt="" onError={() => setOk(false)} className="w-[55vw] max-w-[640px] select-none object-contain opacity-[0.045] grayscale dark:opacity-[0.06] dark:invert" /> {/* eslint-disable-line @next/next/no-img-element */}
    </div>
  );
}
