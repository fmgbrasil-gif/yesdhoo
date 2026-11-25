import { headers } from 'next/headers';
import { ExternalLink, Printer } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { folderConfig, folderToken } from '@/lib/folder';
import { folderData } from '@/lib/folder-data';
import { screenScope } from '@/lib/auth';
import { fileUrl } from '@/lib/storage';
import { PageHeader } from '@/components/basic';
import { ActionButton, ActionForm, Field, Tabs, Toggle } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { ClientReportSend } from '@/components/ClientReportSend';
import { resetFolderTexts, saveFolder } from './actions';

function Img({ name, current, label, hint, png }: { name: string; current: string | null; label: string; hint: string; png?: boolean }) {
  const url = fileUrl(current);
  return (
    <Field label={label} hint={hint} group>
      <div className="flex flex-wrap items-center gap-3">
        {url && <img src={url} alt="" className="h-20 w-32 rounded-lg bg-ink-100 object-contain" />}{/* eslint-disable-line @next/next/no-img-element */}
        <div className="min-w-0 flex-1 space-y-1">
          <PhotoInput name={name} multiple={false} max={1} size={png ? 800 : 2000} png={png} />
          {url && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`remove_${name}`} className="accent-red-600" /> Remover esta imagem</label>}
        </div>
      </div>
    </Field>
  );
}

function Gallery({ name, removeName, keys, label, hint, max, png }: { name: string; removeName: string; keys: string[]; label: string; hint: string; max: number; png?: boolean }) {
  return (
    <Field label={label} hint={hint} group>
      <PhotoInput name={name} max={max} png={png} size={png ? 600 : 1600} />
      {keys.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {keys.map((k) => (
            <label key={k} className="space-y-1 text-xs">
              <img src={fileUrl(k) ?? ''} alt="" className="aspect-[4/3] w-full rounded-lg bg-ink-100 object-contain" />{/* eslint-disable-line @next/next/no-img-element */}
              <span className="flex items-center gap-1"><input type="checkbox" name={removeName} value={k} className="accent-red-600" /> Remover</span>
            </label>
          ))}
        </div>
      )}
    </Field>
  );
}

/** Editor do folder promocional: textos, cores, numeros da rede, fotos, planos, logos de clientes e contato. */
export default async function FolderPage() {
  const user = await requireAdmin();
  const c = folderConfig(user.tenant.folder);
  const { screens, numbers } = await folderData(screenScope(user), c);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const link = `${origin}/folder/${folderToken(user.tenantId)}`;
  const name = user.tenant.tradeName || user.tenant.name;
  const inp = (n: string, v: string, ph = '') => <input name={n} defaultValue={v} placeholder={ph} className="input" />;
  const area = (n: string, v: string, rows = 3) => <textarea name={n} defaultValue={v} rows={rows} className="input" />;

  return (
    <>
      <PageHeader title="Folder promocional" crumbs={[{ label: 'Minhas telas', href: '/telas' }, { label: 'Folder promocional' }]}>
        <a href="/relatorio/pontos" target="_blank" className="btn-primary"><ExternalLink size={15} /> Ver folder</a>
        <a href="/relatorio/pontos" target="_blank" className="btn-ghost"><Printer size={15} /> Imprimir / PDF</a>
      </PageHeader>

      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0"><p className="font-semibold">Link do folder para enviar a anunciantes</p><p className="break-all text-xs text-ink-400">{link}</p></div>
        <ClientReportSend url={link} phone={null} text={`*${name.toUpperCase()} - MÍDIA INDOOR*\n\nOlá! Conheça os nossos pontos de exibição: telas digitais em ${numbers.citiesCount || ''} cidade(s), com ${numbers.peopleDay || 'muitas'} pessoas por dia.\n\nVeja o folder completo:\n${link}`} />
      </div>

      <div className="card p-5">
        <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-900 dark:text-ink-200">
          Preencha as abas e clique em <b>Salvar folder</b>. Campos dos números em branco são calculados sozinhos pelos pontos cadastrados ({screens.length} ponto(s) no folder).
          Se for enviar muitas imagens, salve aos poucos (por exemplo, uma aba por vez). Fotos, nome e descrição de cada ponto ficam em <b>Minhas telas → editar a tela → Relatório promocional</b>.
        </p>
        <ActionForm action={saveFolder} submit="Salvar folder">
          <Tabs tabs={[
            { label: 'Capa e cores', content: (
              <>
                <Field label="Título da capa">{inp('cover_title', c.cover.title)}</Field>
                <Field label="Subtítulo">{area('cover_subtitle', c.cover.subtitle, 2)}</Field>
                <Field label="Frase do canto da capa">{inp('cover_tagline', c.cover.tagline)}</Field>
                <Img name="cover_image" current={c.cover.image} label="Imagem de fundo da capa" hint="Foto bonita de uma tela instalada ou do público. Fica com um filtro na cor do folder." />
                <Img name="cover_logo" current={c.cover.logo} label="Logo do folder (opcional)" hint="Use uma versão clara (branca) da logo. Em branco, usa a logo da empresa." png />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cor principal"><input type="color" name="primary" defaultValue={c.colors.primary} className="h-10 w-full rounded-lg" /></Field>
                  <Field label="Cor escura"><input type="color" name="dark" defaultValue={c.colors.dark} className="h-10 w-full rounded-lg" /></Field>
                </div>
                <Toggle name="stats_auto" label="Números da capa automáticos" hint="Pontos, cidades e pessoas por dia/mês. Desmarque para escrever os seus abaixo." defaultChecked={c.stats.auto} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {c.stats.items.map((x, i) => <div key={i} className="space-y-1">{inp(`stat_value_${i}`, x.value, 'Ex.: 30 mil')}{inp(`stat_label_${i}`, x.label, 'Ex.: pessoas/mês')}</div>)}
                </div>
              </>
            ) },
            { label: 'Números da rede', content: (
              <>
                <Toggle name="network_show" label="Mostrar a página “A rede em números”" defaultChecked={c.network.show} />
                <Field label="Título">{inp('network_title', c.network.title)}</Field>
                <Field label="Texto">{area('network_text', c.network.text, 2)}</Field>
                <p className="text-xs text-ink-400">Deixe em branco para usar o valor calculado (mostrado em cinza dentro do campo).</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Quantidade de telas">{inp('net_screens', c.network.screens, numbers.screens)}</Field>
                  <Field label="Pessoas por dia">{inp('net_people_day', c.network.peopleDay, numbers.peopleDay || 'Ex.: 3.200')}</Field>
                  <Field label="Pessoas por mês">{inp('net_people_month', c.network.peopleMonth, numbers.peopleMonth || 'Ex.: 85.000')}</Field>
                  <Field label="Dias de funcionamento">{inp('net_days', c.network.days, numbers.days || 'Ex.: Segunda a sábado')}</Field>
                  <Field label="Horas no ar por dia">{inp('net_hours_day', c.network.hoursDay, numbers.hoursDay || 'Ex.: 14 horas')}</Field>
                  <Field label="Inserções do anúncio por dia" hint="Calculado pela playlist e pelo horário (anúncio de 15 s).">{inp('net_insertions_day', c.network.insertionsDay, numbers.insertionsDay || 'Ex.: 300 por tela')}</Field>
                  <Field label="Cidades (separe por vírgula)" className="sm:col-span-2">{inp('net_cities', c.network.cities, numbers.cities || 'Ex.: Igarapava/SP, Delta/MG')}</Field>
                  <Field label="Segmentos (separe por vírgula)" className="sm:col-span-2">{inp('net_segments', c.network.segments, numbers.segments || 'Ex.: Academias, Restaurantes')}</Field>
                </div>
                <p className="label">Outras informações que ajudam a vender</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {c.network.extra.map((x, i) => <div key={i} className="grid grid-cols-[1fr_1.4fr] gap-2">{inp(`net_extra_value_${i}`, x.value, ['Ex.: 72%', 'Ex.: 4h', 'Ex.: 18 a 45 anos', 'Ex.: Wi-Fi'][i])}{inp(`net_extra_label_${i}`, x.label, ['Ex.: público classe A/B', 'Ex.: tempo médio no local', 'Ex.: faixa etária', 'Ex.: telas monitoradas 24h'][i])}</div>)}
                </div>
              </>
            ) },
            { label: 'Quem somos', content: (
              <>
                <Toggle name="about_show" label="Mostrar “Quem somos”" defaultChecked={c.about.show} />
                <Field label="Título">{inp('about_title', c.about.title)}</Field>
                <Field label="Texto">{area('about_text', c.about.text, 5)}</Field>
                <Img name="about_image" current={c.about.image} label="Imagem" hint="Equipe, escritório ou uma tela em funcionamento." />
                <Toggle name="benefits_show" label="Mostrar “Por que anunciar”" defaultChecked={c.benefits.show} />
                <Field label="Título dos benefícios">{inp('benefits_title', c.benefits.title)}</Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  {c.benefits.items.map((b, i) => <div key={i} className="space-y-1 rounded-lg border border-ink-100 p-2 dark:border-ink-700">{inp(`benefit_title_${i}`, b.title, `Benefício ${i + 1}`)}{area(`benefit_text_${i}`, b.text, 2)}</div>)}
                </div>
              </>
            ) },
            { label: 'Telas instaladas', content: (
              <>
                <Toggle name="gallery_show" label="Mostrar a página de fotos das telas instaladas" defaultChecked={c.gallery.show} />
                <Field label="Título">{inp('gallery_title', c.gallery.title)}</Field>
                <Field label="Texto">{area('gallery_text', c.gallery.text, 2)}</Field>
                <Gallery name="gallery_photos" removeName="remove_gallery" keys={c.gallery.photos} max={8} label="Fotos das telas instaladas" hint="Até 8 fotos. As fotos são reduzidas no navegador antes de enviar." />
                <p className="label">Pontos</p>
                <Field label="Título da página dos pontos">{inp('points_title', c.points.title)}</Field>
                <Field label="Texto de introdução (opcional)">{inp('points_intro', c.points.intro)}</Field>
                <Field label="Pontos por página"><select name="points_per" defaultValue={String(c.points.perPage)} className="input"><option value="4">4 por página (compacto)</option><option value="2">2 por página (fotos maiores)</option></select></Field>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Toggle name="points_address" label="Mostrar endereço" defaultChecked={c.points.showAddress} />
                  <Toggle name="points_flow" label="Mostrar pessoas/dia e mês" defaultChecked={c.points.showFlow} />
                  <Toggle name="points_hours" label="Mostrar horários" defaultChecked={c.points.showHours} />
                </div>
              </>
            ) },
            { label: 'Planos', content: (
              <>
                <Toggle name="plans_show" label="Mostrar “Formatos e investimento”" defaultChecked={c.plans.show} />
                <Field label="Título">{inp('plans_title', c.plans.title)}</Field>
                <Field label="Texto">{inp('plans_intro', c.plans.intro)}</Field>
                <Toggle name="plans_prices" label="Mostrar os preços" hint="Desmarcado, o folder mostra os planos sem valores (para negociar)." defaultChecked={c.plans.showPrices} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {c.plans.items.map((p, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg border border-ink-100 p-3 dark:border-ink-700">
                      {inp(`plan_name_${i}`, p.name, `Plano ${i + 1} (em branco = não aparece)`)}
                      {inp(`plan_desc_${i}`, p.desc, 'Ex.: Até 3 pontos')}
                      <div className="grid grid-cols-2 gap-1.5">{inp(`plan_duration_${i}`, p.duration, 'Ex.: 15 segundos')}{inp(`plan_price_${i}`, p.price, 'Ex.: R$ 290,00')}</div>
                      {inp(`plan_insertions_${i}`, p.insertions, 'Ex.: 300 inserções por dia')}
                      <label className="flex items-center gap-2 text-xs"><input type="radio" name="plan_highlight" value={i} defaultChecked={p.highlight} className="accent-violet-600" /> Destacar como “mais escolhido”</label>
                    </div>
                  ))}
                </div>
                <Field label="Observação">{inp('plans_note', c.plans.note)}</Field>
                <Toggle name="specs_show" label="Mostrar “Como enviar o seu anúncio” (resolução, formato, duração)" defaultChecked={c.specs.show} />
              </>
            ) },
            { label: 'Clientes e contato', content: (
              <>
                <Toggle name="clients_show" label="Mostrar logos de clientes" defaultChecked={c.clients.show} />
                <Field label="Título">{inp('clients_title', c.clients.title)}</Field>
                <Gallery name="client_logos" removeName="remove_logo" keys={c.clients.logos} max={16} png label="Logos dos clientes" hint="Até 16 logos (PNG com fundo transparente fica melhor)." />
                <Field label="Título do contato">{inp('contact_title', c.contact.title)}</Field>
                <Field label="Texto">{inp('contact_text', c.contact.text)}</Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="WhatsApp" hint="Gera o QR Code do folder">{inp('contact_whatsapp', c.contact.whatsapp, '(16) 99999-9999')}</Field>
                  <Field label="Telefone">{inp('contact_phone', c.contact.phone, user.tenant.phone ?? '')}</Field>
                  <Field label="E-mail">{inp('contact_email', c.contact.email, user.tenant.email ?? '')}</Field>
                  <Field label="Instagram">{inp('contact_instagram', c.contact.instagram, '@yesmidiaindoor')}</Field>
                  <Field label="Site">{inp('contact_site', c.contact.site)}</Field>
                  <Field label="Endereço">{inp('contact_address', c.contact.address)}</Field>
                </div>
              </>
            ) },
          ]} />
        </ActionForm>
        <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-700">
          <ActionButton action={resetFolderTexts} fields={{}} className="btn-ghost text-xs" title="Voltar textos e cores ao padrão (as imagens ficam)">Voltar textos ao padrão</ActionButton>
        </div>
      </div>
    </>
  );
}
