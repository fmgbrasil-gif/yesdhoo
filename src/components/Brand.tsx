import Image from 'next/image';

/** Credito da desenvolvedora: logo da Imperium X (versao escura em fundo claro e branca em fundo escuro). */
export function DevCredit({ className = '', dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[11px] text-ink-400 ${className}`}>
      <span>Desenvolvido por</span>
      {dark ? (
        <Image src="/brand/imperiumx-white.png" alt="Imperium X" width={456} height={72} className="h-4 w-auto" />
      ) : (
        <>
          <Image src="/brand/imperiumx.png" alt="Imperium X" width={591} height={132} className="h-6 w-auto dark:hidden" />
          <Image src="/brand/imperiumx-white.png" alt="Imperium X" width={456} height={72} className="hidden h-4 w-auto dark:block" />
        </>
      )}
    </span>
  );
}

/** Marca d'agua: a logo da empresa bem suave no centro da area de trabalho, sem bloquear cliques. */
export function Watermark({ src }: { src: string | null }) {
  if (!src) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center print:hidden lg:left-64">
      <img src={src} alt="" className="w-[55vw] max-w-[640px] select-none object-contain opacity-[0.045] grayscale dark:opacity-[0.06] dark:invert" /> {/* eslint-disable-line @next/next/no-img-element */}
    </div>
  );
}
