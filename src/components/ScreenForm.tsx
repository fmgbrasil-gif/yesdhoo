import type { Screen } from '@prisma/client';
import { Field, Tabs, Toggle, WeekDaysPicker } from './ui';
import MapView from './MapLazy';
import { STATES, TIMEZONES, UPDATE_FREQUENCIES } from '@/lib/constants';

type Opt = { id: string; name: string };

/** Campos do cadastro de tela (abas Info, Localizacao, Metricas e Configuracoes). */
export function ScreenFields({ screen, categories, clients }: { screen?: Screen; categories: Opt[]; clients: Opt[] }) {
  const s = screen;
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Tabs tabs={[
        { label: 'Info', content: (
          <>
            <Field label="Orientação">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="orientation" value="H" defaultChecked={s?.orientation !== 'V'} className="accent-violet-500" /> Horizontal</label>
                <label className="flex items-center gap-2"><input type="radio" name="orientation" value="V" defaultChecked={s?.orientation === 'V'} className="accent-violet-500" /> Vertical</label>
              </div>
            </Field>
            <Field label="Girar a imagem no aparelho" hint="Automático: tela vertical ligada num aparelho que sai deitado (TV box, TV) gira sozinha. Se ficar de cabeça para baixo, escolha a outra direção.">
              <select name="rotation" defaultValue={s?.rotation ?? 'auto'} className="input">
                <option value="auto">Automático (recomendado)</option>
                <option value="90">Girar 90° (sentido horário)</option>
                <option value="270">Girar 270° (sentido anti-horário)</option>
                <option value="180">Girar 180° (de cabeça para baixo)</option>
                <option value="0">Não girar</option>
              </select>
            </Field>
            <Field label="Nome"><input name="name" required defaultValue={s?.name} className="input" placeholder="Ex.: Academia Mais Músculo — Recepção" /></Field>
            <Field label="Imagem" hint="Logo ou foto do ponto (opcional)"><input type="file" name="image" accept="image/*" className="input" /></Field>
            <Field label="Cliente / ponto parceiro">
              <select name="clientId" defaultValue={s?.clientId ?? ''} className="input"><option value="">Nenhum</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone 1"><input name="phone1" defaultValue={s?.phone1 ?? ''} className="input" /></Field>
              <Field label="Telefone 2"><input name="phone2" defaultValue={s?.phone2 ?? ''} className="input" /></Field>
            </div>
          </>
        ) },
        { label: 'Localização', content: (
          <>
            <MapView points={[{ name: s?.name ?? 'Nova tela', lat: s?.latitude ?? -15.78, lng: s?.longitude ?? -47.93 }]} inputs={{ lat: 'latitude', lng: 'longitude' }} height={200} />
            <p className="text-xs text-ink-400">Arraste o pino para definir a localização exata da tela.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Endereço" className="col-span-2"><input name="road" defaultValue={s?.road ?? ''} className="input" placeholder="Ex.: Avenida Brasil" /></Field>
              <Field label="Número"><input name="number" defaultValue={s?.number ?? ''} className="input" /></Field>
              <Field label="Complemento"><input name="complement" defaultValue={s?.complement ?? ''} className="input" /></Field>
              <Field label="Bairro"><input name="neighborhood" defaultValue={s?.neighborhood ?? ''} className="input" /></Field>
              <Field label="CEP"><input name="zipcode" defaultValue={s?.zipcode ?? ''} className="input" /></Field>
              <Field label="Cidade" className="col-span-2"><input name="city" defaultValue={s?.city ?? ''} className="input" /></Field>
              <Field label="Estado"><select name="state" defaultValue={s?.state ?? ''} className="input"><option value="">—</option>{STATES.map((uf) => <option key={uf}>{uf}</option>)}</select></Field>
            </div>
          </>
        ) },
        { label: 'Métricas', content: (
          <>
            <Field label="Segmento"><select name="categoryId" defaultValue={s?.categoryId ?? ''} className="input"><option value="">Selecione</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Abre às"><input type="time" name="workStart" defaultValue={s?.workStart ?? ''} className="input" /></Field>
              <Field label="Fecha às"><input type="time" name="workEnd" defaultValue={s?.workEnd ?? ''} className="input" /></Field>
            </div>
            <Field label="Dias de funcionamento" group><WeekDaysPicker defaultValue={s?.weekDays} /></Field>
            <Field label="Fluxo médio de pessoas por dia" hint="Usado para estimar o alcance das campanhas"><input type="number" min={0} name="avgFlow" defaultValue={s?.avgFlow ?? ''} className="input" /></Field>
          </>
        ) },
        { label: 'Configurações', content: (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fuso horário"><select name="timezone" defaultValue={s?.timezone ?? 'America/Sao_Paulo'} className="input">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Verificar atualizações a cada"><select name="updateFrequency" defaultValue={s?.updateFrequency ?? 10} className="input">{UPDATE_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></Field>
            </div>
            <Toggle name="audioEnabled" label="Permitir som" hint="Reproduz o áudio dos vídeos" defaultChecked={s?.audioEnabled} />
            <Toggle name="footerEnabled" label="Exibir rodapé" hint="Faixa fixa na parte de baixo da tela" defaultChecked={s?.footerEnabled} />
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
              <Field label="Texto do rodapé" className="col-span-2"><input name="footerText" defaultValue={s?.footerText ?? 'Anuncie aqui'} className="input" /></Field>
              <Field label="Cor de fundo"><input type="color" name="footerBg" defaultValue={s?.footerBg ?? '#000000'} className="h-10 w-full rounded-lg" /></Field>
              <Field label="Cor do texto"><input type="color" name="footerColor" defaultValue={s?.footerColor ?? '#FFFFFF'} className="h-10 w-full rounded-lg" /></Field>
              <Toggle name="footerClock" label="Mostrar relógio" defaultChecked={s?.footerClock ?? true} />
              <Toggle name="footerWeather" label="Mostrar clima" defaultChecked={s?.footerWeather} />
            </div>
          </>
        ) },
      ]} />
    </>
  );
}
