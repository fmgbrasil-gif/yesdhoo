import crypto from 'node:crypto';
import { parseJson } from './util';

export type FolderItem = { title: string; text: string };
export type FolderPlan = { name: string; desc: string; duration: string; insertions: string; price: string; highlight: boolean };
export type FolderConfig = {
  colors: { primary: string; dark: string };
  cover: { title: string; subtitle: string; tagline: string; image: string | null; logo: string | null };
  about: { show: boolean; title: string; text: string; image: string | null };
  stats: { auto: boolean; items: { value: string; label: string }[] };
  /** numeros da rede para vender: vazio = calculado pelos pontos cadastrados */
  network: { show: boolean; title: string; text: string; cities: string; peopleDay: string; peopleMonth: string; segments: string; days: string; hoursDay: string; insertionsDay: string; screens: string; extra: { value: string; label: string }[] };
  gallery: { show: boolean; title: string; text: string; photos: string[] };
  benefits: { show: boolean; title: string; items: FolderItem[] };
  points: { title: string; intro: string; perPage: 2 | 4; showAddress: boolean; showFlow: boolean; showHours: boolean };
  plans: { show: boolean; title: string; intro: string; showPrices: boolean; items: FolderPlan[]; note: string };
  specs: { show: boolean };
  clients: { show: boolean; title: string; logos: string[] };
  contact: { title: string; text: string; phone: string; whatsapp: string; email: string; instagram: string; site: string; address: string };
};

export const FOLDER_DEFAULT: FolderConfig = {
  colors: { primary: '#7f4be4', dark: '#2a1240' },
  cover: { title: 'Sua marca onde o público está', subtitle: 'Mídia indoor em telas digitais nos pontos de maior movimento da cidade.', tagline: 'Mídia indoor · DOOH', image: null, logo: null },
  about: { show: true, title: 'Quem somos', text: 'Somos uma rede de mídia indoor com telas digitais instaladas em academias, comércios e serviços. Levamos a sua marca para pessoas que estão no lugar certo, na hora certa, com atenção garantida.', image: null },
  stats: { auto: true, items: [{ value: '', label: '' }, { value: '', label: '' }, { value: '', label: '' }, { value: '', label: '' }] },
  network: {
    show: true, title: 'A rede em números', text: 'Telas digitais em pontos de grande circulação, ligadas o dia todo e com o seu anúncio passando várias vezes por hora.',
    cities: '', peopleDay: '', peopleMonth: '', segments: '', days: '', hoursDay: '', insertionsDay: '', screens: '',
    extra: [{ value: '', label: '' }, { value: '', label: '' }, { value: '', label: '' }, { value: '', label: '' }],
  },
  gallery: { show: true, title: 'Nossas telas instaladas', text: 'Equipamentos profissionais, instalados em locais de destaque e monitorados pela internet.', photos: [] },
  benefits: {
    show: true, title: 'Por que anunciar em mídia indoor',
    items: [
      { title: 'Atenção garantida', text: 'O público está parado, esperando ou treinando: o anúncio é visto de verdade.' },
      { title: 'Público certo', text: 'Escolha os pontos pelo perfil de quem frequenta cada lugar.' },
      { title: 'Frequência', text: 'Seu anúncio passa várias vezes por hora, todos os dias.' },
      { title: 'Comprovação', text: 'Relatório mensal com o número de exibições de cada anúncio.' },
    ],
  },
  points: { title: 'Nossos pontos de exibição', intro: '', perPage: 4, showAddress: true, showFlow: true, showHours: true },
  plans: {
    show: true, title: 'Formatos e investimento', intro: 'Planos mensais, sem taxa de adesão. A produção do vídeo pode ser incluída.', showPrices: false, note: 'Valores sujeitos a alteração. Consulte condições para mais pontos.',
    items: [
      { name: 'Essencial', desc: '1 ponto à sua escolha', duration: '15 segundos', insertions: '', price: '', highlight: false },
      { name: 'Destaque', desc: 'Até 3 pontos', duration: '15 segundos', insertions: '', price: '', highlight: true },
      { name: 'Rede completa', desc: 'Todos os pontos', duration: '15 segundos', insertions: '', price: '', highlight: false },
      { name: '', desc: '', duration: '', insertions: '', price: '', highlight: false },
    ],
  },
  specs: { show: true },
  clients: { show: true, title: 'Marcas que confiam', logos: [] },
  contact: { title: 'Vamos conversar?', text: 'Fale com a gente e monte o plano ideal para a sua marca.', phone: '', whatsapp: '', email: '', instagram: '', site: '', address: '' },
};

/** Junta o que esta salvo com o padrao (campos novos ganham o valor padrao). */
export function folderConfig(raw: string | null | undefined): FolderConfig {
  const v = parseJson<Partial<FolderConfig>>(raw, {});
  const d = FOLDER_DEFAULT;
  const merge = <T extends object>(a: T, b?: Partial<T>) => ({ ...a, ...(b ?? {}) }) as T;
  const list = <T,>(def: T[], got: T[] | undefined, mk: (x: T, i: number) => T) => def.map((x, i) => mk(x, i)).map((x, i) => (got?.[i] ? { ...x, ...got[i] } : x));
  return {
    colors: merge(d.colors, v.colors), cover: merge(d.cover, v.cover), about: merge(d.about, v.about),
    stats: { auto: v.stats?.auto ?? true, items: list(d.stats.items, v.stats?.items, (x) => x) },
    network: { ...merge(d.network, v.network), extra: list(d.network.extra, v.network?.extra, (x) => x) },
    gallery: { ...merge(d.gallery, v.gallery), photos: v.gallery?.photos ?? [] },
    benefits: { ...merge(d.benefits, v.benefits), items: list(d.benefits.items, v.benefits?.items, (x) => x) },
    points: merge(d.points, v.points),
    plans: { ...merge(d.plans, v.plans), items: list(d.plans.items, v.plans?.items, (x) => x) },
    specs: merge(d.specs, v.specs), clients: { ...merge(d.clients, v.clients), logos: v.clients?.logos ?? [] }, contact: merge(d.contact, v.contact),
  };
}

/** Link publico do folder (assinado): quem recebe ve o folder sem login. */
const secret = () => 'yd-folder:' + (process.env.AUTH_SECRET || 'somente-desenvolvimento');
const sign = (s: string) => crypto.createHmac('sha256', secret()).update(s).digest('base64url').slice(0, 22);
export function folderToken(tenantId: string, filters: { operacao?: string; cidade?: string } = {}) {
  const body = Buffer.from(JSON.stringify({ t: tenantId, o: filters.operacao || undefined, c: filters.cidade || undefined })).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function readFolderToken(token: string): { tenantId: string; operacao?: string; cidade?: string } | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || sign(body) !== sig) return null;
  try { const j = JSON.parse(Buffer.from(body, 'base64url').toString()); return j.t ? { tenantId: j.t, operacao: j.o, cidade: j.c } : null; } catch { return null; }
}
