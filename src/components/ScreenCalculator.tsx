'use client';

import { useMemo, useState } from 'react';
import { fmtDuration } from '@/lib/util';

type Row = { slot: number; name: string; client: string | null; duration: number; groupSize: number; active: boolean };

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const n = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** Calculadora de exibicoes: quantas vezes cada midia passa por hora, dia e mes, e simulacao de um anuncio novo. */
export function ScreenCalculator({ rows, workStart, workEnd, days }: { rows: Row[]; workStart: string | null; workEnd: string | null; days: number }) {
  const [start, setStart] = useState(workStart || '08:00');
  const [end, setEnd] = useState(workEnd || '18:00');
  const [perWeek, setPerWeek] = useState(days || 6);
  const [extra, setExtra] = useState(0); // anuncio novo (segundos) para simular
  const active = rows.filter((r) => r.active);
  const slots = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const r of active) m.set(r.slot, [...(m.get(r.slot) ?? []), r]);
    return [...m.values()];
  }, [active]);
  const cycle = slots.reduce((a, s) => a + s.reduce((x, r) => x + r.duration, 0) / s.length, 0) + (extra > 0 ? extra : 0);
  const openMin = Math.max(0, minutes(end) - minutes(start)) || 0;
  const cyclesHour = cycle > 0 ? 3600 / cycle : 0;
  const cyclesDay = cycle > 0 ? (openMin * 60) / cycle : 0;
  const daysMonth = (perWeek * 30) / 7;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="space-y-1"><span className="label">Abre às</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></label>
        <label className="space-y-1"><span className="label">Fecha às</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></label>
        <label className="space-y-1"><span className="label">Dias por semana</span><input type="number" min={1} max={7} value={perWeek} onChange={(e) => setPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 1)))} className="input" /></label>
        <label className="space-y-1"><span className="label">Simular anúncio novo (s)</span><input type="number" min={0} max={300} value={extra} onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} className="input" placeholder="0" /></label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Ciclo da playlist', fmtDuration(cycle)], ['Ciclos por hora', n(cyclesHour)], ['Ciclos por dia', n(cyclesDay)], ['Horas no ar por dia', (openMin / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-brand-50 p-3 dark:bg-ink-900"><p className="text-xs text-ink-500">{k}</p><p className="text-xl font-black text-brand-700 dark:text-brand-300">{v}</p></div>
        ))}
      </div>
      {extra > 0 && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Um anúncio novo de <b>{extra} s</b> passaria <b>{n(cyclesHour)}</b> vezes por hora, <b>{n(cyclesDay)}</b> por dia e cerca de <b>{n(cyclesDay * daysMonth)}</b> por mês. O ciclo da playlist ficaria com {fmtDuration(cycle)}.</p>}
      <div className="max-h-72 overflow-auto rounded-lg border border-ink-100 dark:border-ink-700">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-800"><tr><th className="px-3 py-2">Mídia</th><th className="px-3 py-2 text-right">Duração</th><th className="px-3 py-2 text-right">Por hora</th><th className="px-3 py-2 text-right">Por dia</th><th className="px-3 py-2 text-right">Por mês</th></tr></thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {active.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-ink-400">A playlist desta tela está vazia.</td></tr>}
            {active.map((r, i) => {
              const share = 1 / r.groupSize; // midia de grupo passa uma vez a cada N ciclos
              return (
                <tr key={i}>
                  <td className="px-3 py-2"><span className="font-semibold">{r.name}</span>{r.groupSize > 1 && <span className="block text-xs text-ink-400">em rodízio com {r.groupSize - 1} outra(s)</span>}{r.client && r.groupSize === 1 && <span className="block text-xs text-ink-400">{r.client}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.duration}s</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(cyclesHour * share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(cyclesDay * share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(cyclesDay * share * daysMonth)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-400">Estimativa pelo horário de funcionamento e pela duração de cada mídia. Mídias fora do período agendado ou incompatíveis com a tela são puladas no aparelho.</p>
    </div>
  );
}
