/** Etiqueta colorida da operacao (cada operacao sempre com a mesma cor), para distinguir o que o cliente contratou. */
const COLORS = [
  'bg-violet-100 text-violet-800 ring-violet-300 dark:bg-violet-950 dark:text-violet-200',
  'bg-pink-100 text-pink-800 ring-pink-300 dark:bg-pink-950 dark:text-pink-200',
  'bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200',
  'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200',
  'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-950 dark:text-orange-200',
];
const color = (name: string) => COLORS[[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

export function OperationBadge({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className={`inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200 dark:bg-ink-900 ${className}`} title="Cobrança sem operação: edite para escolher">Sem operação</span>;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${color(name)} ${className}`}>{name}</span>;
}
