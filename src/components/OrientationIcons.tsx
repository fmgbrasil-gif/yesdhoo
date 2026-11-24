/** Duas telinhas (horizontal e vertical): a orientacao que a midia tem fica roxa, a outra esmaecida. */
export function OrientationIcons({ h, v }: { h: boolean; v: boolean }) {
  const on = 'border-violet-600 bg-violet-600/15 dark:border-violet-400 dark:bg-violet-400/20';
  const off = 'border-ink-300 opacity-30 dark:border-ink-500';
  const label = h && v ? 'Horizontal e vertical' : h ? 'Horizontal' : v ? 'Vertical' : 'Sem arquivo';
  return (
    <span className="flex items-end gap-2" title={label} aria-label={label}>
      <span className="flex flex-col items-center gap-0.5">
        <span className={`block h-5 w-8 rounded-[3px] border-2 ${h ? on : off}`} />
        <span className={`block h-0.5 w-3 rounded ${h ? 'bg-violet-600 dark:bg-violet-400' : 'bg-ink-300 opacity-30'}`} />
      </span>
      <span className="flex flex-col items-center gap-0.5">
        <span className={`block h-8 w-5 rounded-[3px] border-2 ${v ? on : off}`} />
        <span className={`block h-0.5 w-2 rounded ${v ? 'bg-violet-600 dark:bg-violet-400' : 'bg-ink-300 opacity-30'}`} />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
