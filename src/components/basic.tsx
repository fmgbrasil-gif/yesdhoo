import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

export function PageHeader({ title, crumbs = [], children }: { title: ReactNode; crumbs?: { label: string; href?: string }[]; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-400" aria-label="Trilha">
          <Link href="/dashboard" className="hover:text-ink-700 dark:hover:text-white">Início</Link>
          {crumbs.map((c) => (
            <span key={c.label} className="flex items-center gap-1.5">
              <span>/</span>
              {c.href ? <Link href={c.href} className="hover:text-ink-700 dark:hover:text-white">{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
        <h1>{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ title = 'Nenhum registro encontrado', text = 'Nada para exibir por aqui ainda.' }: { title?: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
      <Inbox className="mb-2 text-ink-300" size={32} />
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-ink-400">{text}</p>
    </div>
  );
}

export function Avatar({ src, name, size = 40, square }: { src?: string | null; name: string; size?: number; square?: boolean }) {
  const cls = `${square ? 'rounded-lg' : 'rounded-full'} shrink-0 object-cover`;
  if (src) return <img src={src} alt="" width={size} height={size} className={cls} style={{ width: size, height: size }} />; // eslint-disable-line @next/next/no-img-element
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <span className={`${cls} flex items-center justify-center bg-ink-800 font-bold text-brand-400`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials}</span>
  );
}

export function Pagination({ page, size, total, params, base }: { page: number; size: number; total: number; params: Record<string, string | undefined>; base: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number, s = size) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page' && k !== 'size') q.set(k, v);
    if (p > 1) q.set('page', String(p));
    if (s !== 10) q.set('size', String(s));
    const qs = q.toString();
    return qs ? `${base}?${qs}` : base;
  };
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 text-sm text-ink-500 dark:border-ink-700">
      <div className="flex items-center gap-2">
        {[10, 20, 30].map((s) => (
          <Link key={s} href={href(1, s)} className={`rounded-md px-2 py-1 ${s === size ? 'bg-ink-100 font-semibold text-ink-800 dark:bg-ink-700 dark:text-white' : ''}`}>{s}</Link>
        ))}
        <span>Exibindo {from}–{to} de {total}</span>
      </div>
      <div className="flex items-center gap-1">
        {page > 1 && <Link href={href(page - 1)} className="btn-icon" aria-label="Página anterior"><ChevronLeft size={16} /></Link>}
        <span className="px-2">Página {page} de {pages}</span>
        {page < pages && <Link href={href(page + 1)} className="btn-icon" aria-label="Próxima página"><ChevronRight size={16} /></Link>}
      </div>
    </div>
  );
}

export function pageParams(sp: Record<string, string | undefined>) {
  const size = [10, 20, 30].includes(Number(sp.size)) ? Number(sp.size) : 10;
  const page = Math.max(1, Number(sp.page) || 1);
  return { page, size, skip: (page - 1) * size, take: size };
}

/** Grafico de barras simples (sem dependencias). */
export function Bars({ data, height = 120, highlightMax }: { data: { label: string; value: number; title?: string }[]; height?: number; highlightMax?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 20 }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={d.title ?? `${d.label}: ${new Intl.NumberFormat('pt-BR').format(d.value)}`}>
          <div className={`w-full rounded-t-md ${highlightMax && d.value === max && d.value > 0 ? 'bg-brand-400' : 'bg-ink-700 dark:bg-ink-300'}`}
            style={{ height: Math.max(2, (d.value / max) * height) }} />
          <span className="text-[10px] uppercase text-ink-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusDot({ online }: { online: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-ink-300'}`} aria-hidden />;
}
