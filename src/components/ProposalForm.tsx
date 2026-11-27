import type { Proposal } from '@prisma/client';
import { Field, Tabs, Toggle } from './ui';
import { CnpjLookup } from './CnpjLookup';
import { PhotoInput } from './PhotoInput';
import { fileUrl } from '@/lib/storage';
import { parseJson } from '@/lib/util';
import { DEFAULT_BENEFITS, DEFAULT_CONDITIONS } from '@/lib/proposal';

type Net = { points: number; screens: number; daily: number; region: string };
const addDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

/** Campos da proposta: cliente pretendido (com busca do CNPJ) e oferta (numeros da rede, beneficios, valor e condicoes). */
export function ProposalFields({ p, net }: { p?: Proposal | null; net: Net }) {
  const inp = (name: string, v: string | number | null | undefined, ph = '', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input name={name} defaultValue={v ?? ''} placeholder={ph} className="input" {...extra} />;
  const logo = fileUrl(p?.logo);
  return (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Tabs tabs={[
        { label: 'Cliente pretendido', content: (
          <>
            <Field label="CNPJ (opcional)" hint="Com CNPJ, a razão social, cidade e contatos vêm da Receita.">
              <CnpjLookup defaultValue={p?.document} map={{ companyName: 'name', tradeName: 'tradeName', city: 'city', phone: 'phone', email: 'email' }} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Razão social / nome da empresa">{inp('companyName', p?.companyName, 'Ex.: KNN Idiomas Igarapava Ltda', { required: true })}</Field>
              <Field label="Nome que aparece na proposta" hint="Nome fantasia. Ex.: KNN IDIOMAS">{inp('tradeName', p?.tradeName)}</Field>
              <Field label="Instagram">{inp('instagram', p?.instagram, '@knnigarapava')}</Field>
              <Field label="Segmento">{inp('segment', p?.segment, 'Ex.: Escola de idiomas')}</Field>
              <Field label="Responsável / contato">{inp('contactName', p?.contactName)}</Field>
              <Field label="WhatsApp do cliente" hint="Para enviar a proposta">{inp('phone', p?.phone, '(16) 99999-9999')}</Field>
              <Field label="E-mail">{inp('email', p?.email)}</Field>
              <Field label="Cidade">{inp('city', p?.city)}</Field>
            </div>
            <Field label="Objetivo do cliente" hint="Aparece no cartão “Preparada especialmente para”.">
              <textarea name="objective" rows={2} defaultValue={p?.objective ?? ''} className="input" placeholder="Ex.: Amplie a lembrança da marca e divulgue novas turmas, condições e campanhas de matrícula." />
            </Field>
            <Field label="Logo do cliente" hint="PNG ou JPG. Aparece em destaque na proposta." group>
              <div className="flex flex-wrap items-center gap-3">
                {logo && <img src={logo} alt="" className="h-16 w-16 rounded-lg bg-white object-contain ring-1 ring-ink-100" />}{/* eslint-disable-line @next/next/no-img-element */}
                <div className="min-w-0 flex-1 space-y-1">
                  <PhotoInput name="logo" multiple={false} max={1} size={700} png />
                  {logo && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="remove_logo" className="accent-red-600" /> Remover a logo</label>}
                </div>
              </div>
            </Field>
          </>
        ) },
        { label: 'Oferta e valor', content: (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Investimento mensal (R$)">{inp('monthly', p ? (p.monthlyCents / 100).toFixed(2).replace('.', ',') : '', '259,00', { required: true, inputMode: 'decimal' })}</Field>
              <Field label="Texto ao lado do valor">{inp('priceNote', p?.priceNote ?? 'por empresa • cobertura integral da rede YES')}</Field>
              <Field label="Região (subtítulo da capa)">{inp('region', p?.region ?? net.region, 'IGARAPAVA / SP')}</Field>
              <Field label="Proposta válida até">{inp('validUntil', p?.validUntil ?? addDays(15), '', { type: 'date' })}</Field>
            </div>
            <p className="text-xs text-ink-400">Números da rede: já vêm do painel (pontos, telas e média de exibições por tela nos últimos 30 dias). Ajuste se quiser.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Pontos">{inp('points', p?.points ?? net.points, '', { inputMode: 'numeric' })}</Field>
              <Field label="Telas">{inp('screens', p?.screens ?? net.screens, '', { inputMode: 'numeric' })}</Field>
              <Field label="Exibições diárias / tela">{inp('dailyPlays', p?.dailyPlays ?? (net.daily || ''), 'Ex.: 1591', { inputMode: 'numeric' })}</Field>
            </div>
            <Field label="O que a sua empresa recebe (uma linha por item)">
              <textarea name="benefits" rows={5} defaultValue={p ? parseJson<string[]>(p.benefits, []).join('\n') : DEFAULT_BENEFITS.join('\n')} className="input" />
            </Field>
            <Field label="Condições comerciais"><textarea name="conditions" rows={2} defaultValue={p?.conditions ?? DEFAULT_CONDITIONS} className="input" /></Field>
            <Toggle name="showFolder" label="Anexar as páginas do folder no fim da proposta" defaultChecked={p?.showFolder ?? true} />
          </>
        ) },
      ]} />
    </>
  );
}
