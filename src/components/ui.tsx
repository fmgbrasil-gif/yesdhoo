'use client';

import { createContext, useActionState, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { WEEK_DAYS } from '@/lib/constants';

export type ActionResult = { ok?: boolean; error?: string; message?: string } | undefined;
export type FormAction = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

const ModalCtx = createContext<{ close: () => void } | null>(null);

export function Modal({ trigger, title, children, wide, triggerClass = 'btn-primary', titleAttr }: {
  trigger: ReactNode; title: string; children: ReactNode; wide?: boolean; triggerClass?: string; titleAttr?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClass} title={titleAttr} aria-label={titleAttr} onClick={() => setOpen(true)}>{trigger}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={title}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} p-0 text-left font-normal normal-case tracking-normal`}>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-ink-700">
              <h2 className="text-lg font-bold">{title}</h2>
              <button type="button" className="btn-icon" aria-label="Fechar" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <div className="p-5"><ModalCtx.Provider value={{ close: () => setOpen(false) }}>{children}</ModalCtx.Provider></div>
          </div>
        </div>
      )}
    </>
  );
}

export function useModal() { return useContext(ModalCtx); }

/** Formulario ligado a uma server action: mostra erro, fecha o modal e atualiza a pagina ao concluir. */
export function ActionForm({ action, children, submit = 'Salvar', submitClass = 'btn-primary', className = 'space-y-4', cancel, onDone }: {
  action: FormAction; children?: ReactNode; submit?: ReactNode; submitClass?: string; className?: string; cancel?: boolean; onDone?: () => void;
}) {
  // Envio manual (em vez de <form action>) para que o React nao limpe os campos quando a acao devolve erro.
  const [state, setState] = useState<ActionResult>(undefined);
  const [pending, start] = useTransition();
  const modal = useModal();
  const router = useRouter();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await action(undefined, fd);
      setState(r);
      if (r?.ok) { modal?.close(); onDone?.(); router.refresh(); }
    });
  };
  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200" role="alert">{state.error}</p>}
      {state?.ok && state.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">{state.message}</p>}
      <div className="flex justify-end gap-2">
        {cancel && modal && <button type="button" className="btn-ghost" onClick={modal.close}>Cancelar</button>}
        <button className={submitClass} disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}{submit}</button>
      </div>
    </form>
  );
}

/** Botao que executa uma server action simples (sem campos). */
export function ActionButton({ action, children, className = 'btn-icon', title, fields }: {
  action: FormAction; children: ReactNode; className?: string; title?: string; fields?: Record<string, string>;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={run} className="inline-flex">
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={className} title={state?.error || title} aria-label={title} disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : children}
      </button>
    </form>
  );
}

export function Tabs({ tabs }: { tabs: { label: string; content: ReactNode }[] }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900" role="tablist">
        {tabs.map((t, k) => (
          <button key={t.label} type="button" role="tab" aria-selected={i === k} onClick={() => setI(k)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${i === k ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500 dark:text-ink-300'}`}>{t.label}</button>
        ))}
      </div>
      {/* todas as abas ficam montadas para que os campos sejam enviados juntos */}
      {tabs.map((t, k) => <div key={t.label} role="tabpanel" className={i === k ? 'space-y-4' : 'hidden'}>{t.content}</div>)}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="mt-0.5 h-5 w-9 shrink-0 rounded-full bg-ink-200 p-0.5 transition after:block after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 dark:bg-ink-600" />
      <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-xs text-ink-400">{hint}</span>}</span>
    </label>
  );
}

export function WeekDaysPicker({ name = 'weekDays', defaultValue = '' }: { name?: string; defaultValue?: string }) {
  const [sel, setSel] = useState<string[]>(defaultValue ? defaultValue.split(',') : []);
  return (
    <div>
      <input type="hidden" name={name} value={sel.join(',')} />
      <div className="flex flex-wrap gap-1.5">
        {WEEK_DAYS.map((d, i) => {
          const on = sel.includes(String(i));
          return (
            <button key={d} type="button" aria-pressed={on}
              onClick={() => setSel(on ? sel.filter((x) => x !== String(i)) : [...sel, String(i)].sort())}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${on ? 'border-brand-500 bg-brand-100 text-ink-900' : 'border-ink-200 text-ink-500 dark:border-ink-600 dark:text-ink-300'}`}>{d}</button>
          );
        })}
      </div>
      <span className="mt-1 block text-xs text-ink-400">Nenhum dia marcado = todos os dias</span>
    </div>
  );
}

/** Selecao multipla com busca (telas, midias...). Envia varios campos com o mesmo nome. */
export function MultiPicker({ name, options, defaultValue = [], placeholder = 'Buscar...', emptyHint }: {
  name: string; options: { id: string; label: string; sub?: string }[]; defaultValue?: string[]; placeholder?: string; emptyHint?: string;
}) {
  const [sel, setSel] = useState<string[]>(defaultValue);
  const [q, setQ] = useState('');
  const list = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div>
      {sel.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <div className="mb-2 flex gap-2">
        <input className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setSel(sel.length === options.length ? [] : options.map((o) => o.id))}>
          {sel.length === options.length && options.length ? 'Limpar' : 'Todas'}
        </button>
      </div>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-1.5 dark:border-ink-700">
        {list.length === 0 && <p className="p-2 text-sm text-ink-400">{emptyHint || 'Nada encontrado.'}</p>}
        {list.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-700">
            <input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 accent-violet-500" />
            <span className="flex-1 truncate">{o.label}</span>
            {o.sub && <span className="text-xs text-ink-400">{o.sub}</span>}
          </label>
        ))}
      </div>
      <span className="mt-1 block text-xs text-ink-400">{sel.length} selecionada(s)</span>
    </div>
  );
}

export function Confirm({ trigger, triggerClass = 'btn-icon', title, text, phrase, action, fields, confirmLabel = 'Sim, confirmar', titleAttr }: {
  trigger: ReactNode; triggerClass?: string; title: string; text: string; phrase?: string; action: FormAction; fields?: Record<string, string>; confirmLabel?: string; titleAttr?: string;
}) {
  return (
    <Modal trigger={trigger} triggerClass={triggerClass} title={title} titleAttr={titleAttr}>
      <ActionForm action={action} submit={confirmLabel} submitClass="btn-danger" cancel>
        {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <p className="text-sm text-ink-600 dark:text-ink-200">{text}</p>
        {phrase && (
          <Field label={`Para confirmar, digite: ${phrase}`}><input name="confirmPhrase" className="input" autoComplete="off" required pattern={phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} /></Field>
        )}
      </ActionForm>
    </Modal>
  );
}
