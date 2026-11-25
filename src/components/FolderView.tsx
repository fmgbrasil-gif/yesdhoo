import QRCode from 'qrcode';
import type { Tenant } from '@prisma/client';
import type { FolderConfig } from '@/lib/folder';
import type { FolderNumbers } from '@/lib/folder-data';
import { fileUrl, logoOnDark } from '@/lib/storage';
import { parseJson } from '@/lib/util';
import { WEEK_DAYS } from '@/lib/constants';

export type FolderScreen = {
  id: string; name: string; companyName: string | null; promoText: string; photos: string; image: string | null; orientation: string;
  road: string | null; number: string | null; neighborhood: string | null; city: string | null; state: string | null;
  avgFlow: number | null; workStart: string | null; workEnd: string | null; weekDays: string;
  category: { name: string } | null; client: { name: string } | null;
};

const n = (v: number) => Math.round(v).toLocaleString('pt-BR');
const days = (wd: string) => {
  const list = wd.split(',').filter(Boolean).map(Number).sort();
  if (!list.length || list.length === 7) return 'Todos os dias';
  if (list.join(',') === '1,2,3,4,5') return 'Segunda a sexta';
  if (list.join(',') === '1,2,3,4,5,6') return 'Segunda a sábado';
  return list.map((d) => WEEK_DAYS[d]).join(', ');
};
const chunk = <T,>(a: T[], k: number) => Array.from({ length: Math.ceil(a.length / k) }, (_, i) => a.slice(i * k, i * k + k));
const waDigits = (p: string) => { const d = p.replace(/\D/g, ''); return d.length >= 10 ? (d.startsWith('55') && d.length >= 12 ? d : `55${d}`) : ''; };

/** Folder promocional em paginas A4 (capa, quem somos, pontos, planos, clientes e contato). */
export async function FolderView({ tenant, cfg, screens, numbers: N }: { tenant: Tenant; cfg: FolderConfig; screens: FolderScreen[]; numbers: FolderNumbers }) {
  const P = cfg.colors.primary, D = cfg.colors.dark;
  const name = tenant.tradeName || tenant.name;
  const logo = cfg.cover.logo ? fileUrl(cfg.cover.logo) : logoOnDark(fileUrl(tenant.logo));
  const cover = fileUrl(cfg.cover.image);
  const company = (s: FolderScreen) => s.companyName || s.client?.name || s.name;
  const stats = cfg.stats.auto
    ? [[N.screens, 'pontos de exibição'], [String(N.citiesCount || '—'), N.citiesCount === 1 ? 'cidade' : 'cidades'], [N.peopleDay || '—', 'pessoas por dia'], [N.peopleMonth || String(N.segmentsCount || '—'), N.peopleMonth ? 'pessoas por mês' : 'segmentos']]
    : cfg.stats.items.filter((x) => x.value).map((x) => [x.value, x.label]);
  const netCards = [
    ['Telas', N.screens], ['Cidades', N.citiesCount ? String(N.citiesCount) : ''], ['Pessoas por dia', N.peopleDay], ['Pessoas por mês', N.peopleMonth],
    ['Segmentos', N.segmentsCount ? String(N.segmentsCount) : ''], ['Funcionamento', N.days], ['No ar por dia', N.hoursDay], ['Seu anúncio por dia', N.insertionsDay],
    ...N.extra.map((x) => [x.label, x.value]),
  ].filter(([, v]) => v);
  const gallery = cfg.gallery.photos.map((k) => fileUrl(k)).filter(Boolean) as string[];
  const wa = waDigits(cfg.contact.whatsapp || cfg.contact.phone || tenant.phone || '');
  const qr = wa ? await QRCode.toDataURL(`https://wa.me/${wa}`, { margin: 1, width: 260, color: { dark: D, light: '#ffffff' } }) : null;
  const plans = cfg.plans.items.filter((p) => p.name);
  const benefits = cfg.benefits.items.filter((b) => b.title);
  const logos = cfg.clients.logos.map((k) => fileUrl(k)).filter(Boolean) as string[];
  const per = cfg.points.perPage === 2 ? 2 : 4;
  const pages = chunk(screens, per);
  const page = 'fpage relative mx-auto overflow-hidden bg-white shadow-xl print:shadow-none';
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-[26px] font-black leading-tight" style={{ color: D }}>{children}</h2>;
  const Bar = () => <div className="mb-5 mt-2 h-1.5 w-16 rounded-full" style={{ background: P }} />;
  const Foot = ({ k }: { k: string }) => (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-[14mm] py-[5mm] text-[9px] font-semibold uppercase tracking-widest text-white" style={{ background: D }}>
      <span>{name}</span><span>{k}</span>
    </div>
  );

  return (
    <div className="space-y-8 print:space-y-0" style={{ fontFamily: 'Inter, Arial, sans-serif', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', color: '#1d1029' }}>
      <style>{'@page { size: A4; margin: 0; } .fpage { width: 210mm; height: 297mm; } @media print { .fpage { break-after: page; } .fpage:last-child { break-after: auto; } }'}</style>

      {/* CAPA */}
      <section className={page} style={{ background: D }}>
        {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}{/* eslint-disable-line @next/next/no-img-element */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${P}cc 0%, ${D}e6 55%, ${D} 100%)` }} />
        <div className="relative flex h-full flex-col justify-between p-[16mm] text-white">
          <div className="flex items-start justify-between">
            {logo ? <img src={logo} alt={name} className="h-[22mm] w-auto max-w-[80mm] object-contain" /> : <p className="text-3xl font-black">{name}</p>}{/* eslint-disable-line @next/next/no-img-element */}
            <p className="text-right text-[10px] uppercase tracking-[0.3em] opacity-90">{cfg.cover.tagline}</p>
          </div>
          <div>
            <div className="mb-6 h-2 w-24 rounded-full bg-white/90" />
            <h1 className="text-[44px] font-black leading-[1.05]">{cfg.cover.title}</h1>
            <p className="mt-4 max-w-[150mm] text-lg leading-snug opacity-95">{cfg.cover.subtitle}</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {stats.slice(0, 4).map(([v, l]) => (
              <div key={l + v} className="rounded-2xl bg-white/15 p-4 text-center backdrop-blur"><p className="text-3xl font-black">{v}</p><p className="mt-1 text-[10px] uppercase tracking-wide opacity-90">{l}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* A REDE EM NUMEROS */}
      {cfg.network.show && netCards.length > 0 && (
        <section className={page}>
          <div className="space-y-7 p-[16mm] pb-[24mm]">
            <div><H>{cfg.network.title}</H><Bar />{cfg.network.text && <p className="text-[13px] leading-relaxed text-gray-700">{cfg.network.text}</p>}</div>
            <div className="grid grid-cols-2 gap-4">
              {netCards.map(([k, v], i) => (
                <div key={k} className="rounded-3xl p-5" style={i % 3 === 0 ? { background: `linear-gradient(135deg, ${P}, ${D})`, color: '#fff' } : { background: `${P}10` }}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${i % 3 === 0 ? 'opacity-85' : 'text-gray-500'}`}>{k}</p>
                  <p className="mt-1 text-[26px] font-black leading-tight" style={i % 3 === 0 ? {} : { color: D }}>{v}</p>
                </div>
              ))}
            </div>
            {(N.cities || N.segments) && (
              <div className="grid grid-cols-2 gap-6">
                {[['Cidades atendidas', N.cities], ['Segmentos dos pontos', N.segments]].filter(([, v]) => v).map(([t, v]) => (
                  <div key={t}>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: D }}>{t}</p>
                    <div className="flex flex-wrap gap-1.5">{v.split(',').map((x) => x.trim()).filter(Boolean).map((x) => <span key={x} className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: `${P}1a`, color: D }}>{x}</span>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Foot k="A rede" />
        </section>
      )}

      {/* QUEM SOMOS + BENEFICIOS */}
      {(cfg.about.show || (cfg.benefits.show && benefits.length > 0)) && (
        <section className={page}>
          <div className="space-y-8 p-[16mm] pb-[24mm]">
            {cfg.about.show && (
              <div className={`grid gap-8 ${cfg.about.image ? 'grid-cols-[1.1fr_1fr]' : ''}`}>
                <div><H>{cfg.about.title}</H><Bar /><p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-700">{cfg.about.text}</p></div>
                {cfg.about.image && <img src={fileUrl(cfg.about.image)!} alt="" className="h-[85mm] w-full rounded-3xl object-cover" />}{/* eslint-disable-line @next/next/no-img-element */}
              </div>
            )}
            {stats.length > 0 && (
              <div className="grid grid-cols-4 gap-3 rounded-3xl p-5 text-white" style={{ background: `linear-gradient(120deg, ${P}, ${D})` }}>
                {stats.slice(0, 4).map(([v, l]) => <div key={l + v} className="text-center"><p className="text-3xl font-black">{v}</p><p className="text-[10px] uppercase tracking-wide opacity-90">{l}</p></div>)}
              </div>
            )}
            {cfg.benefits.show && benefits.length > 0 && (
              <div>
                <H>{cfg.benefits.title}</H><Bar />
                <div className="grid grid-cols-2 gap-4">
                  {benefits.map((b, i) => (
                    <div key={i} className="rounded-2xl border p-5" style={{ borderColor: `${P}33`, background: `${P}0d` }}>
                      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: P }}>{i + 1}</span>
                      <p className="text-[15px] font-black" style={{ color: D }}>{b.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-gray-700">{b.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Foot k="Quem somos" />
        </section>
      )}

      {/* TELAS INSTALADAS */}
      {cfg.gallery.show && gallery.length > 0 && (
        <section className={page}>
          <div className="flex h-full flex-col p-[16mm] pb-[24mm]">
            <H>{cfg.gallery.title}</H><Bar />
            {cfg.gallery.text && <p className="-mt-2 mb-5 text-[12px] text-gray-600">{cfg.gallery.text}</p>}
            <div className={`grid flex-1 gap-3 ${gallery.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`} style={{ gridAutoRows: '1fr' }}>
              {gallery.slice(0, 8).map((u, i) => <img key={u} src={u} alt="" className={`h-full w-full rounded-2xl object-cover ${gallery.length === 3 && i === 0 ? 'col-span-2' : ''}`} />)}{/* eslint-disable-line @next/next/no-img-element */}
            </div>
          </div>
          <Foot k="Telas instaladas" />
        </section>
      )}

      {/* PONTOS */}
      {pages.map((group, gi) => (
        <section key={gi} className={page}>
          <div className="flex h-full flex-col p-[14mm] pb-[22mm]">
            <div className="mb-4 flex items-end justify-between">
              <div><H>{cfg.points.title}</H>{gi === 0 && cfg.points.intro && <p className="mt-1 text-[12px] text-gray-600">{cfg.points.intro}</p>}</div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{gi + 1}/{pages.length}</p>
            </div>
            <div className={`grid flex-1 gap-4 ${per === 2 ? 'grid-rows-2' : 'grid-cols-2 grid-rows-2'}`}>
              {group.map((s) => {
                const photos = parseJson<string[]>(s.photos, []).map((k) => fileUrl(k)!).filter(Boolean);
                const main = photos[0] ?? fileUrl(s.image);
                const place = [s.neighborhood, s.city && `${s.city}${s.state ? '/' + s.state : ''}`].filter(Boolean).join(' · ');
                const tags = [cfg.points.showFlow && s.avgFlow ? `${n(s.avgFlow)} pessoas/dia` : null, cfg.points.showFlow && s.avgFlow ? `${n(s.avgFlow * (s.weekDays.split(',').filter(Boolean).length || 7) * 30 / 7)} pessoas/mês` : null, cfg.points.showHours && s.workStart && s.workEnd ? `${s.workStart} às ${s.workEnd}` : null, cfg.points.showHours ? days(s.weekDays) : null].filter(Boolean);
                return (
                  <div key={s.id} className={`flex overflow-hidden rounded-3xl border border-gray-200 ${per === 2 ? 'flex-row' : 'flex-col'}`}>
                    <div className={`relative ${per === 2 ? 'w-[55%]' : 'h-[48%]'} shrink-0`} style={{ background: D }}>
                      {main ? <img src={main} alt="" className="h-full w-full object-cover" /> /* eslint-disable-line @next/next/no-img-element */
                        : <div className="flex h-full items-center justify-center text-5xl font-black text-white/70">{company(s).slice(0, 2).toUpperCase()}</div>}
                      {s.category && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: D }}>{s.category.name}</span>}
                      <span className="absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase text-white" style={{ background: P }}>Tela {s.orientation === 'V' ? 'vertical' : 'horizontal'}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <h3 className="text-[15px] font-black leading-tight" style={{ color: D }}>{company(s)}</h3>
                      {place && <p className="mt-0.5 text-[11px] font-semibold" style={{ color: P }}>{place}</p>}
                      {cfg.points.showAddress && s.road && <p className="text-[10px] text-gray-500">{[s.road, s.number].filter(Boolean).join(', ')}</p>}
                      {s.promoText && <p className={`mt-2 text-[11px] leading-relaxed text-gray-700 ${per === 4 ? 'line-clamp-4' : ''}`}>{s.promoText}</p>}
                      {photos.length > 1 && <div className="mt-2 grid grid-cols-3 gap-1">{photos.slice(1, 4).map((u) => <img key={u} src={u} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />)}</div>}{/* eslint-disable-line @next/next/no-img-element */}
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-2">{tags.map((t) => <span key={t} className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `${P}1a`, color: D }}>{t}</span>)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Foot k="Pontos de exibição" />
        </section>
      ))}

      {/* PLANOS + ESPECIFICACOES */}
      {((cfg.plans.show && plans.length > 0) || cfg.specs.show) && (
        <section className={page}>
          <div className="space-y-8 p-[16mm] pb-[24mm]">
            {cfg.plans.show && plans.length > 0 && (
              <div>
                <H>{cfg.plans.title}</H><Bar />
                {cfg.plans.intro && <p className="-mt-2 mb-5 text-[12px] text-gray-600">{cfg.plans.intro}</p>}
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, minmax(0, 1fr))` }}>
                  {plans.map((p, i) => (
                    <div key={i} className="flex flex-col rounded-3xl border-2 p-5" style={p.highlight ? { borderColor: P, background: `linear-gradient(160deg, ${P}, ${D})`, color: '#fff' } : { borderColor: `${P}33` }}>
                      {p.highlight && <span className="mb-2 self-start rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold uppercase" style={{ color: D }}>Mais escolhido</span>}
                      <p className="text-lg font-black" style={p.highlight ? {} : { color: D }}>{p.name}</p>
                      {p.desc && <p className={`mt-1 text-[11px] ${p.highlight ? 'opacity-90' : 'text-gray-600'}`}>{p.desc}</p>}
                      <ul className={`mt-3 space-y-1 text-[11px] ${p.highlight ? '' : 'text-gray-700'}`}>
                        {p.duration && <li>• Anúncio de {p.duration}</li>}
                        {p.insertions && <li>• {p.insertions}</li>}
                      </ul>
                      {cfg.plans.showPrices && p.price && <p className="mt-auto pt-4 text-2xl font-black" style={p.highlight ? {} : { color: P }}>{p.price}<span className="text-[10px] font-semibold opacity-80"> /mês</span></p>}
                    </div>
                  ))}
                </div>
                {cfg.plans.note && <p className="mt-3 text-[10px] text-gray-500">{cfg.plans.note}</p>}
              </div>
            )}
            {cfg.specs.show && (
              <div>
                <H>Como enviar o seu anúncio</H><Bar />
                <div className="grid grid-cols-2 gap-4">
                  {[['Tela horizontal', '1920 × 1080 px (16:9)', 'h-[16mm] w-[28mm]'], ['Tela vertical', '1080 × 1920 px (9:16)', 'h-[28mm] w-[16mm]']].map(([t, d, sz]) => (
                    <div key={t} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: `${P}0d` }}>
                      <div className={`${sz} shrink-0 rounded-md border-[3px]`} style={{ borderColor: P }} />
                      <div><p className="text-[13px] font-black" style={{ color: D }}>{t}</p><p className="text-[11px] text-gray-700">{d}</p></div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
                  {[['Formato', 'Vídeo MP4 (H.264) ou imagem JPG/PNG'], ['Duração', '10 a 30 segundos'], ['Tamanho', 'Até 50 MB por arquivo']].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-gray-200 p-3"><p className="text-[9px] font-bold uppercase text-gray-500">{k}</p><p className="font-semibold">{v}</p></div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-gray-500">Não tem o vídeo pronto? Podemos produzir para você.</p>
              </div>
            )}
          </div>
          <Foot k="Formatos" />
        </section>
      )}

      {/* CLIENTES + CONTATO */}
      <section className={page} style={{ background: D }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 85% 10%, ${P}99, transparent 55%)` }} />
        <div className="relative flex h-full flex-col p-[16mm] text-white">
          {cfg.clients.show && logos.length > 0 && (
            <div className="mb-10">
              <h2 className="text-[26px] font-black">{cfg.clients.title}</h2>
              <div className="mb-5 mt-2 h-1.5 w-16 rounded-full bg-white/90" />
              <div className="grid grid-cols-4 gap-3">
                {logos.slice(0, 16).map((u) => <div key={u} className="flex h-[22mm] items-center justify-center rounded-2xl bg-white p-3"><img src={u} alt="" className="max-h-full max-w-full object-contain" /></div>)}{/* eslint-disable-line @next/next/no-img-element */}
              </div>
            </div>
          )}
          <div className="mt-auto grid grid-cols-[1fr_auto] items-end gap-8">
            <div>
              {logo && <img src={logo} alt={name} className="mb-6 h-[16mm] w-auto object-contain" />}{/* eslint-disable-line @next/next/no-img-element */}
              <h2 className="text-[40px] font-black leading-tight">{cfg.contact.title}</h2>
              <p className="mt-2 max-w-[120mm] text-[14px] opacity-90">{cfg.contact.text}</p>
              <ul className="mt-6 space-y-1.5 text-[13px]">
                {[['WhatsApp', cfg.contact.whatsapp], ['Telefone', cfg.contact.phone || tenant.phone], ['E-mail', cfg.contact.email || tenant.email], ['Instagram', cfg.contact.instagram], ['Site', cfg.contact.site], ['Endereço', cfg.contact.address]].filter(([, v]) => v).map(([k, v]) => (
                  <li key={k}><span className="inline-block w-24 text-[10px] font-bold uppercase tracking-wide opacity-70">{k}</span><span className="font-semibold">{v}</span></li>
                ))}
              </ul>
            </div>
            {qr && <div className="rounded-3xl bg-white p-3 text-center"><img src={qr} alt="QR Code do WhatsApp" className="h-[38mm] w-[38mm]" /><p className="mt-1 text-[9px] font-bold uppercase" style={{ color: D }}>Fale no WhatsApp</p></div>}{/* eslint-disable-line @next/next/no-img-element */}
          </div>
        </div>
      </section>
    </div>
  );
}
