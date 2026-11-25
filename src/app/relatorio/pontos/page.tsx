import type { Metadata } from 'next';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl, logoOnDark } from '@/lib/storage';
import { parseJson } from '@/lib/util';
import { WEEK_DAYS } from '@/lib/constants';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Nossos pontos de mídia indoor', robots: { index: false, follow: false } };

const n = (v: number) => Math.round(v).toLocaleString('pt-BR');
const days = (wd: string) => {
  const list = wd.split(',').filter(Boolean).map(Number).sort();
  if (!list.length || list.length === 7) return 'Todos os dias';
  if (list.join(',') === '1,2,3,4,5') return 'Segunda a sexta';
  if (list.join(',') === '1,2,3,4,5,6') return 'Segunda a sábado';
  return list.map((d) => WEEK_DAYS[d]).join(', ');
};

/** Relatorio promocional (A4) com os pontos ativos: nome da empresa, fotos, local, publico e horarios. */
export default async function RelatorioPontos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const t = user.tenant;
  const [screens, operations, cities] = await Promise.all([
    db.screen.findMany({
      where: {
        ...screenScope(user), promoInclude: true,
        ...(sp.instaladas ? { deviceToken: { not: null } } : {}),
        ...(sp.operacao ? { operations: { some: { id: sp.operacao } } } : {}),
        ...(sp.cidade ? { city: sp.cidade } : {}),
      },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      include: { category: { select: { name: true } }, client: { select: { name: true, tradeName: true } } },
    }),
    db.operation.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.screen.findMany({ where: { ...screenScope(user), city: { not: null } }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } }),
  ]);
  const logo = logoOnDark(fileUrl(t.logo));
  const flow = screens.reduce((a, s) => a + (s.avgFlow ?? 0), 0);
  const cityCount = new Set(screens.map((s) => s.city).filter(Boolean)).size;
  const segs = new Set(screens.map((s) => s.category?.name).filter(Boolean)).size;
  const company = (s: (typeof screens)[number]) => s.companyName || s.client?.name || s.name;

  return (
    <main className="min-h-screen bg-[#ece6f6] py-6 text-[#1d1029] print:bg-white print:py-0" style={{ fontFamily: 'Inter, Arial, sans-serif', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <style>{'@page { size: A4; margin: 10mm; } @media print { .ponto { break-inside: avoid; } }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-end justify-between gap-3 px-2 print:hidden">
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="block text-xs font-semibold text-gray-600">Operação</span><select name="operacao" defaultValue={sp.operacao ?? ''} className="rounded border border-gray-400 bg-white px-2 py-1"><option value="">Todas</option>{operations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-xs font-semibold text-gray-600">Cidade</span><select name="cidade" defaultValue={sp.cidade ?? ''} className="rounded border border-gray-400 bg-white px-2 py-1"><option value="">Todas</option>{cities.map((c) => <option key={c.city} value={c.city!}>{c.city}</option>)}</select></label>
          <label className="flex items-center gap-1 pb-1"><input type="checkbox" name="instaladas" value="1" defaultChecked={!!sp.instaladas} /> Só telas já instaladas (pareadas)</label>
          <button className="rounded bg-[#2a1240] px-3 py-1 font-semibold text-white">Ver</button>
        </form>
        <PrintButton />
      </div>
      <p className="mx-auto mb-3 max-w-[210mm] px-2 text-xs text-gray-600 print:hidden">Fotos, nome completo da empresa e descrição: em Minhas telas → editar a tela → aba <b>Relatório promocional</b>. Para salvar em PDF, use Imprimir e escolha “Salvar como PDF” (marque “Gráficos de fundo”).</p>

      <article className="mx-auto max-w-[210mm] bg-white shadow print:max-w-none print:shadow-none">
        <header className="bg-gradient-to-br from-[#8b55f0] to-[#2a1240] p-8 text-white">
          <div className="flex items-center justify-between gap-4">
            {logo ? <img src={logo} alt={t.tradeName || t.name} className="h-16 w-auto" /> : <p className="text-2xl font-black">{t.tradeName || t.name}</p>}{/* eslint-disable-line @next/next/no-img-element */}
            <p className="text-right text-xs uppercase tracking-widest opacity-80">Mídia indoor · DOOH</p>
          </div>
          <h1 className="mt-8 text-3xl font-black leading-tight">Nossos pontos de exibição</h1>
          <p className="mt-1 text-sm opacity-90">Sua marca nas telas dos lugares onde o seu público está todos os dias.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Pontos', String(screens.length)], ['Cidades', String(cityCount || '—')], ['Pessoas por dia', flow ? n(flow) : '—'], ['Segmentos', String(segs || '—')]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/15 p-3 text-center"><p className="text-2xl font-black">{v}</p><p className="text-[10px] uppercase tracking-wide opacity-90">{k}</p></div>
            ))}
          </div>
        </header>

        <section className="grid gap-5 p-6 sm:grid-cols-2">
          {screens.length === 0 && <p className="col-span-full py-10 text-center text-gray-500">Nenhum ponto ativo com estes filtros.</p>}
          {screens.map((s) => {
            const photos = parseJson<string[]>(s.photos, []).map((k) => fileUrl(k)!).filter(Boolean);
            const main = photos[0] ?? fileUrl(s.image);
            const place = [s.neighborhood, s.city && `${s.city}${s.state ? '/' + s.state : ''}`].filter(Boolean).join(' · ');
            return (
              <div key={s.id} className="ponto overflow-hidden rounded-2xl border border-[#e4dcf3] bg-white">
                <div className="relative aspect-[16/10] bg-[#2a1240]">
                  {main ? <img src={main} alt="" className="h-full w-full object-cover" /> /* eslint-disable-line @next/next/no-img-element */
                    : <div className="flex h-full items-center justify-center text-4xl font-black text-white/80">{company(s).slice(0, 2).toUpperCase()}</div>}
                  {s.category && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#2a1240]">{s.category.name}</span>}
                  <span className="absolute right-3 top-3 rounded-full bg-[#7f4be4] px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">Tela {s.orientation === 'V' ? 'vertical' : 'horizontal'}</span>
                </div>
                {photos.length > 1 && (
                  <div className="grid grid-cols-3 gap-1 p-1">
                    {photos.slice(1, 4).map((u) => <img key={u} src={u} alt="" className="aspect-[4/3] w-full rounded object-cover" />)}{/* eslint-disable-line @next/next/no-img-element */}
                  </div>
                )}
                <div className="space-y-1.5 p-4">
                  <h2 className="text-base font-black leading-tight">{company(s)}</h2>
                  {place && <p className="text-xs font-semibold text-[#7f4be4]">{place}</p>}
                  {s.road && <p className="text-xs text-gray-500">{[s.road, s.number].filter(Boolean).join(', ')}</p>}
                  {s.promoText && <p className="text-xs leading-relaxed text-gray-700">{s.promoText}</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-semibold">
                    {s.avgFlow ? <span className="rounded-full bg-[#f3edff] px-2 py-0.5 text-[#2a1240]">{n(s.avgFlow)} pessoas/dia</span> : null}
                    {s.workStart && s.workEnd && <span className="rounded-full bg-[#f3edff] px-2 py-0.5 text-[#2a1240]">{s.workStart} às {s.workEnd}</span>}
                    <span className="rounded-full bg-[#f3edff] px-2 py-0.5 text-[#2a1240]">{days(s.weekDays)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 bg-[#2a1240] px-6 py-4 text-xs text-white">
          <span className="font-bold">{t.tradeName || t.name}</span>
          <span className="opacity-90">{[t.phone, t.email].filter(Boolean).join(' · ') || 'Anuncie aqui'}</span>
        </footer>
      </article>
    </main>
  );
}
