import Link from 'next/link';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths } from '@/lib/billing';
import { fmtDate } from '@/lib/money';
import { periodHref, type Period } from '@/lib/period';
import { Field, Modal } from './ui';

const monthName = (ym: string) => { const t = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`)); return t[0].toUpperCase() + t.slice(1); };

/** Barra de periodo: mes anterior/proximo, escolher mes, periodo personalizado e todo o periodo. keep: filtros a manter. */
export function PeriodBar({ base, p, keep = {} }: { base: string; p: Period; keep?: Record<string, string | undefined> }) {
  const { all, custom, mes, month, de, ate } = p;
  const hidden = Object.entries(keep).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <span className="label mr-1">Período</span>
      {!all && !custom && <Link href={periodHref(base, p, { ...keep, mes: addMonths(mes, -1) })} className="btn-icon" aria-label="Mês anterior" title="Mês anterior"><ChevronLeft size={16} /></Link>}
      <span className="min-w-40 text-center font-bold">{all ? 'Todo o período' : custom ? `${fmtDate(de)} a ${fmtDate(ate)}` : monthName(mes)}</span>
      {!all && !custom && <Link href={periodHref(base, p, { ...keep, mes: addMonths(mes, 1) })} className="btn-icon" aria-label="Próximo mês" title="Próximo mês"><ChevronRight size={16} /></Link>}
      <form className="flex items-center gap-1" action={base}>
        {hidden}
        <input type="month" name="mes" defaultValue={!all && !custom ? mes : ''} aria-label="Escolher mês" className="input !py-1.5" />
        <button className="btn-ghost !py-1.5">Ir</button>
      </form>
      <Modal trigger={<><CalendarRange size={15} /> Período personalizado</>} triggerClass="btn-ghost !py-1.5" title="Período personalizado">
        <form action={base} className="space-y-4">
          {hidden}
          <div className="grid gap-3 sm:grid-cols-2"><Field label="De"><input type="date" name="de" required defaultValue={de ?? ''} className="input" /></Field><Field label="Até"><input type="date" name="ate" required defaultValue={ate ?? ''} className="input" /></Field></div>
          <div className="flex justify-end"><button className="btn-primary">Aplicar</button></div>
        </form>
      </Modal>
      {(all || custom || mes !== month) && <Link href={periodHref(base, { ...p, params: {} }, keep)} className="btn-ghost !py-1.5">Mês atual</Link>}
      {!all && <Link href={periodHref(base, { ...p, params: { mes: 'todos' } }, keep)} className="btn-ghost !py-1.5">Todo o período</Link>}
    </div>
  );
}
