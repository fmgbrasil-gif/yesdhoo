import type { Media } from '@prisma/client';
import { Field, MultiPicker, Tabs, Toggle, WeekDaysPicker } from './ui';
import { parseJson } from '@/lib/util';

type Opt = { id: string; name: string };
export type MediaFormData = { clients: Opt[]; categories: Opt[]; screens: { id: string; label: string; sub?: string }[] };

function Colors({ fields, cfg }: { fields: [string, string, string][]; cfg: Record<string, string> }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {fields.map(([name, label, def]) => <Field key={name} label={label}><input type="color" name={name} defaultValue={cfg[name] ?? def} className="h-10 w-full rounded-lg" /></Field>)}
    </div>
  );
}

/** Formulario unico para todos os tipos de conteudo (abas Info, Agendamento e Inclusao rapida). */
export function MediaFields({ type, media, data, onScreens = [] }: { type: string; media?: Media; data: MediaFormData; onScreens?: string[] }) {
  const m = media;
  const cfg = parseJson<Record<string, string>>(m?.config, {});
  const util = ['hora', 'dolar', 'clima'].includes(type);
  const duration = (
    <Field label="Duração" hint={type === 'arquivo' ? 'Em segundos. Para vídeos, vale a duração real do arquivo.' : 'Em segundos'}>
      <input type="number" name="duration" min={3} max={3600} defaultValue={m?.duration ?? (type === 'arquivo' ? 15 : 10)} className="input" />
    </Field>
  );
  const info = (
    <>
      {!util && <Field label={type === 'rss' ? 'Título' : 'Nome'}><input name="name" required maxLength={75} defaultValue={m?.name} className="input" placeholder={type === 'aviso' ? 'Ex.: Aviso de funcionamento' : type === 'rss' ? 'Ex.: Notícias de esporte' : 'Ex.: Campanha de Natal'} /></Field>}
      {['arquivo', 'youtube', 'link'].includes(type) && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cliente"><select name="clientId" defaultValue={m?.clientId ?? ''} className="input"><option value="">Avulso</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Categoria"><select name="categoryId" defaultValue={m?.categoryId ?? ''} className="input"><option value="">Selecione</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </div>
      )}
      {type === 'arquivo' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arquivo horizontal" hint={m?.fileH ? 'Já enviado — escolha outro para substituir' : 'Imagem ou vídeo 16:9 (ex.: 1920×1080)'}><input type="file" name="fileH" accept="image/*,video/*" className="input" /></Field>
          <Field label="Arquivo vertical" hint={m?.fileV ? 'Já enviado — escolha outro para substituir' : 'Imagem ou vídeo 9:16 (ex.: 1080×1920)'}><input type="file" name="fileV" accept="image/*,video/*" className="input" /></Field>
          <p className="col-span-2 text-xs text-ink-400">O conteúdo só é reproduzido em telas da mesma orientação do arquivo enviado.</p>
        </div>
      )}
      {type === 'youtube' && <Field label="Link do vídeo no YouTube"><input name="url" type="url" required defaultValue={m?.url ?? ''} className="input" placeholder="https://www.youtube.com/watch?v=..." /></Field>}
      {type === 'link' && <Field label="Endereço da página" hint="A página precisa permitir exibição incorporada (iframe)."><input name="url" type="url" required defaultValue={m?.url ?? ''} className="input" placeholder="https://..." /></Field>}
      {type === 'rss' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fonte"><input name="source" defaultValue={cfg.source ?? ''} className="input" placeholder="Ex.: G1, R7, UOL" /></Field>
            <Field label="Imagem / logo"><input type="file" name="image" accept="image/*" className="input" /></Field>
          </div>
          <Field label="Link do feed RSS"><input name="url" type="url" required defaultValue={m?.url ?? ''} className="input" placeholder="https://site.com/rss" /></Field>
          <Colors cfg={cfg} fields={[['bg', 'Cor de fundo', '#111827'], ['color', 'Cor da fonte', '#ffffff']]} />
        </>
      )}
      {type === 'aviso' && (
        <>
          <Toggle name="showTitle" label="Exibir título" defaultChecked={m ? String(cfg.showTitle) !== 'false' : true} />
          <Field label="Texto" hint="Até 400 caracteres"><textarea name="text" required maxLength={400} rows={4} defaultValue={cfg.text ?? ''} className="input" /></Field>
          <Colors cfg={cfg} fields={[['bg', 'Cor de fundo', '#0b1120'], ['titleColor', 'Cor do título', '#f9c21a'], ['textColor', 'Cor do texto', '#ffffff']]} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tamanho da fonte"><select name="fontSize" defaultValue={cfg.fontSize ?? 'padrao'} className="input"><option value="padrao">Padrão</option><option value="pequena">Pequena</option><option value="grande">Grande</option></select></Field>
            <Field label="Imagem (opcional)"><input type="file" name="image" accept="image/*" className="input" /></Field>
          </div>
        </>
      )}
      {util && (
        <>
          <p className="rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-900 dark:text-ink-200">Escolha combinações de cores suaves e legíveis. Muito brilho pode dificultar a leitura.</p>
          {type === 'hora' && <Field label="Imagem / logo" hint="Tamanho sugerido: 600×600px"><input type="file" name="image" accept="image/*" className="input" /></Field>}
          <Colors cfg={cfg} fields={[['bg', 'Cor de fundo', '#0b1120'], ['color', 'Cor da fonte', '#ffffff']]} />
        </>
      )}
      {duration}
      {['arquivo', 'youtube', 'link'].includes(type) && (
        <><input type="hidden" name="hasStats" value="1" /><Toggle name="storeStats" label="Gravar estatísticas" hint="Contabiliza cada reprodução no relatório de exibições" defaultChecked={m?.storeStats ?? true} /></>
      )}
    </>
  );
  const schedule = (
    <>
      <p className="text-sm text-ink-500">Deixe em branco para exibir sempre. Fora do período, do turno ou dos dias marcados a mídia é pulada automaticamente.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início da veiculação"><input type="date" name="startDate" defaultValue={m?.startDate ?? ''} className="input" /></Field>
        <Field label="Fim da veiculação"><input type="date" name="endDate" defaultValue={m?.endDate ?? ''} className="input" /></Field>
        <Field label="Turno — das"><input type="time" name="shiftStart" defaultValue={m?.shiftStart ?? ''} className="input" /></Field>
        <Field label="Turno — até"><input type="time" name="shiftEnd" defaultValue={m?.shiftEnd ?? ''} className="input" /></Field>
      </div>
      <Field label="Dias da semana"><WeekDaysPicker defaultValue={m?.weekDays} /></Field>
    </>
  );
  const quick = (
    <>
      <input type="hidden" name="hasScreens" value="1" />
      <p className="text-sm text-ink-500">Marque as telas que devem exibir este conteúdo. Ele entra no fim da playlist de cada uma.</p>
      <MultiPicker name="screens" options={data.screens} defaultValue={onScreens} placeholder="Busque pelo nome da tela..." emptyHint="Nenhuma tela cadastrada." />
    </>
  );
  return (
    <>
      {m ? <input type="hidden" name="id" value={m.id} /> : <input type="hidden" name="type" value={type} />}
      <Tabs tabs={[{ label: 'Info', content: info }, { label: 'Agendamento', content: schedule }, { label: 'Inclusão rápida', content: quick }]} />
    </>
  );
}
