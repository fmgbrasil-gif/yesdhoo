import { ActionButton } from './ui';
import { setRotation } from '@/app/(painel)/telas/actions';

const OPTS: [string, string, string][] = [
  ['auto', 'Automático', 'Gira sozinho quando a tela vertical está num aparelho deitado'],
  ['0', 'Normal (0°)', 'Sem giro'],
  ['90', '90° horário', 'Imagem deitada para a direita'],
  ['180', '180°', 'De cabeça para baixo'],
  ['270', '270° (90° anti-horário)', 'Imagem deitada para a esquerda'],
];

/** Escolha da posicao da imagem na TV: um clique e a tela muda em ate 20 s. */
export function RotationPicker({ id, value, vertical }: { id: string; value: string; vertical: boolean }) {
  const deg = (v: string) => (v === 'auto' ? 0 : Number(v));
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Se a imagem aparece de lado ou de cabeça para baixo na TV, clique na posição que deixa o texto de pé. A TV muda em até 20 segundos; se não ficar certo, tente a próxima.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {OPTS.map(([v, label, hint]) => (
          <ActionButton key={v} action={setRotation} fields={{ id, rotation: v }} title={hint}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center text-xs font-semibold ${value === v ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-ink-900' : 'border-ink-100 hover:border-brand-300 dark:border-ink-700'}`}>
            <span className="flex h-16 w-16 items-center justify-center">
              <span className={`flex items-center justify-center rounded border-2 border-current bg-white text-[10px] font-black dark:bg-ink-800 ${vertical ? 'h-14 w-8' : 'h-8 w-14'}`} style={{ transform: `rotate(${deg(v)}deg)` }}>{v === 'auto' ? 'A' : 'Yes'}</span>
            </span>
            {label}
            {value === v && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[9px] uppercase text-white">em uso</span>}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}
