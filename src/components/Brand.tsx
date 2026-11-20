'use client';

import { useEffect, useState } from 'react';

/** Testa a imagem no navegador antes de exibi-la, para nunca mostrar imagem quebrada. */
function useImage(src: string | null) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(false);
    if (!src) return;
    const img = new Image();
    img.onload = () => setOk(true);
    img.src = src;
  }, [src]);
  return ok;
}

const DEV_LOGO = '/brand/imperiumx.png';

/** Credito da desenvolvedora: logo quando o arquivo existir; enquanto isso, o nome em texto. */
export function DevCredit({ className = '', dark }: { className?: string; dark?: boolean }) {
  const ok = useImage(DEV_LOGO);
  return (
    <span className={`inline-flex items-center gap-2 text-[11px] text-ink-400 ${className}`}>
      <span>Desenvolvido por</span>
      {ok
        ? <img src={DEV_LOGO} alt="Imperium X" className="h-5 w-auto object-contain" /> /* eslint-disable-line @next/next/no-img-element */
        : <b className={dark ? 'text-ink-200' : 'text-ink-600'}>Imperium X</b>}
    </span>
  );
}

/** Marca d'agua: a logo da empresa bem suave no centro da area de trabalho, sem bloquear cliques. */
export function Watermark({ src }: { src: string | null }) {
  const ok = useImage(src);
  if (!src || !ok) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center print:hidden lg:left-64">
      <img src={src} alt="" className="w-[55vw] max-w-[640px] select-none object-contain opacity-[0.045] grayscale dark:opacity-[0.06] dark:invert" /> {/* eslint-disable-line @next/next/no-img-element */}
    </div>
  );
}
