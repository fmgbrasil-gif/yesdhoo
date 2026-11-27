import type { Proposal, Tenant } from '@prisma/client';
import { fileUrl, logoOnDark } from '@/lib/storage';
import { fmtMoney } from '@/lib/money';
import { fmtDoc } from '@/lib/docs';
import { parseJson } from '@/lib/util';
import { DEFAULT_FOLDER_PAGES } from '@/lib/proposal';

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
const br = (d: Date | string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', ...(typeof d === 'string' ? {} : { timeStyle: 'short' }) }).format(typeof d === 'string' ? new Date(d + 'T12:00:00') : d);

/** Proposta comercial (A4) no padrao da Yes: capa, cliente, alcance, beneficios, investimento, condicoes e o folder. */
export function ProposalView({ p, tenant, pages }: { p: Proposal; tenant: Tenant; pages?: string[] }) {
  const ok = p.status === 'aceita';
  const D = ok ? '#064e3b' : '#1d1340';
  const P = ok ? '#10b981' : '#e6288a';
  const name = tenant.tradeName || tenant.name;
  const logo = logoOnDark(fileUrl(tenant.logo));
  const clientLogo = fileUrl(p.logo);
  const benefits = parseJson<string[]>(p.benefits, []).filter(Boolean);
  const folder = p.showFolder ? (pages?.length ? pages : DEFAULT_FOLDER_PAGES) : [];
  const card = 'rounded-[18px]';
  return (
    <div className="space-y-6 print:space-y-0" style={{ fontFamily: 'Inter, Arial, sans-serif', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', color: '#1d1340' }}>
      <style>{'@page { size: A4; margin: 0; } .ppage { width: 210mm; min-height: 297mm; } @media print { .ppage { break-after: page; height: 297mm; overflow: hidden; } .ppage:last-child { break-after: auto; } }'}</style>
      <section className="ppage relative mx-auto overflow-hidden bg-white shadow-xl print:shadow-none">
        <header className="relative overflow-hidden px-[14mm] pb-[12mm] pt-[12mm] text-white" style={{ background: D }}>
          <div className="absolute -right-[22mm] -top-[30mm] h-[95mm] w-[95mm] rounded-full" style={{ background: ok ? '#065f46' : '#3a1670' }} />
          <div className="absolute -right-[20mm] top-[22mm] h-[70mm] w-[70mm] rounded-full" style={{ background: P }} />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="h-10 w-1.5 rounded-full bg-[#fcc419]" />
              {logo ? <img src={logo} alt={name} className="h-11 w-auto" /> : <span className="text-3xl font-black">{name}</span>}{/* eslint-disable-line @next/next/no-img-element */}
              <span className="ml-2 text-lg font-black tracking-wide text-[#fcc419]">MÍDIA INDOOR</span>
            </div>
            <h1 className="mt-7 text-[30px] font-black leading-none">PROPOSTA COMERCIAL</h1>
            <p className="mt-2 text-[11px] uppercase tracking-wide opacity-85">Publicidade digital{p.region ? ` em ${p.region}` : ''} · Nº {String(p.number).padStart(4, '0')}</p>
            <p className="mt-5 text-[15px]">Sua marca onde as pessoas realmente estão.</p>
          </div>
          {ok && (
            <div className="absolute right-[14mm] top-[12mm] rotate-[-8deg] rounded-xl border-4 border-white px-4 py-2 text-center">
              <p className="text-lg font-black leading-none">PROPOSTA ACEITA</p>
              <p className="text-[9px] font-semibold">{p.acceptedAt ? br(p.acceptedAt) : ''}</p>
            </div>
          )}
        </header>

        <div className="space-y-6 px-[11mm] py-[7mm]">
          <div className={`relative flex gap-5 ${card} p-6`} style={{ background: ok ? '#ecfdf5' : '#f3f0fb' }}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: ok ? '#065f46' : '#3a1670' }}>Preparada especialmente para</p>
              <p className="mt-3 text-[24px] font-black leading-tight">{p.tradeName || p.companyName}</p>
              {p.instagram && <p className="mt-1 text-[13px] font-bold" style={{ color: P }}>{p.instagram.startsWith('@') ? p.instagram : '@' + p.instagram}</p>}
              {p.segment && <p className="text-[12px] text-gray-500">{p.segment}</p>}
              {p.objective && <p className="mt-3 text-[13px] leading-snug">{p.objective}</p>}
            </div>
            {clientLogo && <div className="flex h-[38mm] w-[38mm] shrink-0 items-center justify-center rounded-xl bg-white p-2"><img src={clientLogo} alt="" className="max-h-full max-w-full object-contain" /></div>}{/* eslint-disable-line @next/next/no-img-element */}
          </div>

          <div>
            <h2 className="mb-3 text-[17px] font-black uppercase" style={{ color: ok ? '#065f46' : '#3a1670' }}>Alcance da rede {name.split(' ')[0].toUpperCase()}</h2>
            <div className="grid grid-cols-3 gap-3">
              {[[n(p.points), 'Pontos estratégicos', '#f3e8fb', '#1d1340'], [n(p.screens), 'Telas na rede', '#f3f0fb', '#1d1340'], [n(p.dailyPlays), 'Exibições diárias / tela', '#f3f0fb', P]].map(([v, l, bg, c]) => (
                <div key={l} className={`${card} p-5`} style={{ background: bg }}><p className="text-[28px] font-black leading-none" style={{ color: c }}>{v}</p><p className="mt-3 text-[9px] font-black uppercase tracking-wide text-gray-600">{l}</p></div>
              ))}
            </div>
          </div>

          {benefits.length > 0 && (
            <div>
              <h2 className="mb-3 text-[17px] font-black uppercase" style={{ color: ok ? '#065f46' : '#3a1670' }}>O que a sua empresa recebe</h2>
              <ul className="space-y-2.5">{benefits.map((b) => <li key={b} className="flex gap-3 text-[13px]"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: P }} />{b}</li>)}</ul>
            </div>
          )}

          <div className={`${card} flex flex-wrap items-center gap-6 px-7 py-6 text-white`} style={{ background: ok ? '#065f46' : '#3a1670' }}>
            <div>
              <p className="text-[13px] font-black uppercase">Investimento mensal</p>
              <p className="mt-2 text-[40px] font-black leading-none text-[#fcc419]">{fmtMoney(p.monthlyCents)}</p>
            </div>
            <div className="text-[12px]">{p.priceNote && <p className="opacity-90">{p.priceNote}</p>}<p className="mt-1 font-black">{n(p.points)} pontos / {n(p.screens)} telas</p></div>
          </div>

          <div>
            <p className="text-[12px] font-black uppercase" style={{ color: ok ? '#065f46' : '#3a1670' }}>Condições comerciais</p>
            <p className="mt-1 whitespace-pre-line text-[12px] text-gray-600">{p.conditions}</p>
            {p.validUntil && <p className="mt-1 text-[11px] text-gray-600">Proposta válida até {br(p.validUntil)}.</p>}
            <p className="mt-1 text-[10px] text-gray-500">Dados operacionais informados pelo painel {name.split(' ')[0].toUpperCase()}; exibições são médias, não audiência única.</p>
          </div>

          {ok && (
            <div className={`${card} border-2 border-emerald-500 bg-emerald-50 p-4 text-[11px] text-emerald-900`}>
              <p className="font-black uppercase">Aceite eletrônico da proposta</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-0.5">
                  <p>Aceito por <b>{p.signerName}</b>{p.signerDoc ? ` · ${p.signerDoc.length === 14 ? 'CNPJ' : 'CPF'} ${fmtDoc(p.signerDoc)}` : ''}</p>
                  <p>Em {p.acceptedAt ? br(p.acceptedAt) : ''}{p.signerIp ? ` · IP ${p.signerIp}` : ''}</p>
                </div>
                {p.signature && <img src={p.signature} alt="Assinatura" className="h-14 w-auto rounded bg-white px-2" />}{/* eslint-disable-line @next/next/no-img-element */}
              </div>
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-2 bg-[#fcc419]" />
      </section>

      {folder.map((src) => (
        <section key={src} className="ppage mx-auto overflow-hidden bg-white shadow-xl print:shadow-none">
          <img src={fileUrl(src) ?? src} alt="" className="block h-full w-full object-cover" />{/* eslint-disable-line @next/next/no-img-element */}
        </section>
      ))}
    </div>
  );
}
