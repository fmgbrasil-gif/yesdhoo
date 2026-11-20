/* Dados de demonstracao (ficticios). Rode com: npm run db:seed */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SEGMENTS } from '../src/lib/constants';

const db = new PrismaClient();
const day = (offset: number) => new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));

async function poster(key: string, title: string, sub: string, bg: string, fg: string, vertical = false) {
  const [w, h] = vertical ? [1080, 1920] : [1920, 1080];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><circle cx="${w * 0.85}" cy="${h * 0.2}" r="${h * 0.35}" fill="${fg}" opacity=".12"/><text x="50%" y="48%" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="${w * 0.07}" fill="${fg}">${title}</text><text x="50%" y="58%" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.028}" fill="${fg}" opacity=".85">${sub}</text></svg>`;
  const file = path.resolve('storage', key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, svg);
  return key;
}

async function main() {
  if (await db.user.count()) {
    // Banco ja existente: garante que o dono da plataforma (ADMIN_EMAIL, ou o primeiro administrador) tem o papel de plataforma.
    const owner = (process.env.ADMIN_EMAIL && (await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL.trim().toLowerCase() } })))
      || (await db.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } }));
    if (owner && !(await db.user.count({ where: { superAdmin: true } }))) {
      await db.user.update({ where: { id: owner.id }, data: { superAdmin: true } });
      const t = await db.tenant.update({ where: { id: owner.tenantId }, data: { isPlatform: true } });
      if (!t.slug) await db.tenant.update({ where: { id: t.id }, data: { slug: t.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'principal' } });
      console.log(`Dono da plataforma: ${owner.email}`);
    }
    console.log('Banco já possui dados — seed ignorado.');
    return;
  }

  for (const name of SEGMENTS) await db.category.upsert({ where: { name }, create: { name }, update: {} });
  const cat = Object.fromEntries((await db.category.findMany()).map((c) => [c.name, c.id]));

  // Producao: com ADMIN_EMAIL definido, cria apenas a conta e o administrador (senha provisoria, trocada no 1o acesso).
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const production = !!adminEmail;
  if (production && (process.env.ADMIN_PASSWORD ?? '').length < 8) throw new Error('Defina ADMIN_PASSWORD (mínimo de 8 caracteres) junto com ADMIN_EMAIL.');
  const tenant = await db.tenant.create({ data: { name: process.env.TENANT_NAME || (production ? 'Minha rede' : 'Rede Demonstração'), planScreens: Number(process.env.PLAN_SCREENS) || (production ? 50 : 12), isPlatform: true, slug: production ? 'principal' : 'demo' } });
  await db.user.create({
    data: {
      tenantId: tenant.id, name: 'Administrador', role: 'admin', email: adminEmail ?? 'admin@yesdooh.com.br',
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'yesdooh123', 12), mustChangePassword: production, superAdmin: true,
    },
  });

  // biblioteca global de conteudos dinamicos (modelos proprios, renderizados pelo player)
  const lib = (library: string, name: string, type: string, config: object, duration = 12, url?: string) =>
    db.media.create({ data: { library, name, type, config: JSON.stringify(config), duration, url, storeStats: false } });
  await Promise.all([
    lib('marca', 'Anuncie aqui', 'aviso', { title: 'Anuncie aqui', text: 'Sua marca vista por quem passa todos os dias. Fale com a gente!', bg: '#0b1120', titleColor: '#f9c21a', textColor: '#ffffff', showTitle: true }),
    lib('marca', 'Se você olhou, funciona', 'aviso', { title: 'Se você olhou, é porque funciona', text: 'Mídia indoor: atenção garantida no ponto de espera.', bg: '#f9c21a', titleColor: '#0b1120', textColor: '#0b1120', showTitle: true }),
    lib('saude', 'Saúde — Beba água', 'aviso', { title: 'Dica de saúde', text: 'Beba água ao longo do dia. A hidratação melhora a concentração e a disposição.', bg: '#0e7490', titleColor: '#ffffff', textColor: '#e0f7ff', showTitle: true }),
    lib('saude', 'Saúde — Movimente-se', 'aviso', { title: 'Você sabia?', text: '30 minutos de caminhada por dia já reduzem o risco de doenças do coração.', bg: '#166534', titleColor: '#ffffff', textColor: '#dcfce7', showTitle: true }),
    lib('saude', 'Todos contra a dengue', 'aviso', { title: 'Todos contra a dengue', text: 'Elimine água parada: vasos, pneus e garrafas. 10 minutos por semana fazem a diferença.', bg: '#b45309', titleColor: '#ffffff', textColor: '#fff7ed', showTitle: true }),
    lib('sazonais', 'Novembro Azul', 'aviso', { title: 'Novembro Azul', text: 'Cuidar da saúde também é coisa de homem. Faça seus exames preventivos.', bg: '#1d4ed8', titleColor: '#ffffff', textColor: '#dbeafe', showTitle: true }),
    lib('sazonais', 'Outubro Rosa', 'aviso', { title: 'Outubro Rosa', text: 'O diagnóstico precoce salva vidas. Faça o autoexame e consulte seu médico.', bg: '#be185d', titleColor: '#ffffff', textColor: '#fce7f3', showTitle: true }),
    lib('noticias', 'Notícias — G1', 'rss', { source: 'G1', bg: '#111827', color: '#ffffff' }, 12, 'https://g1.globo.com/rss/g1/'),
    lib('noticias', 'Notícias — Tecnologia', 'rss', { source: 'G1 Tecnologia', bg: '#111827', color: '#ffffff' }, 12, 'https://g1.globo.com/rss/g1/tecnologia/'),
    lib('diversos', 'Hora certa', 'hora', { bg: '#0b1120', color: '#f9c21a' }, 10),
    lib('diversos', 'Cotação do dólar', 'dolar', { bg: '#064e3b', color: '#ffffff' }, 10),
    lib('diversos', 'Previsão do tempo', 'clima', { bg: '#0c4a6e', color: '#ffffff' }, 10),
    lib('diversos', 'Trânsito seguro', 'aviso', { title: 'Trânsito seguro', text: 'Se beber, não dirija. Use o cinto e respeite os limites de velocidade.', bg: '#7f1d1d', titleColor: '#ffffff', textColor: '#fee2e2', showTitle: true }),
  ]);
  const library = await db.media.findMany({ where: { tenantId: null } });

  if (production) { console.log(`Conta criada. Entre com ${adminEmail} e a senha provisória definida em ADMIN_PASSWORD.`); return; }

  const clients = await Promise.all(
    [['Academia Corpo Ativo', 'Academias'], ['Restaurante Sabor da Praça', 'Restaurantes'], ['Mercado Bom Preço', 'Supermercados'], ['Ótica Visão Clara', 'Ótica'], ['Pet Shop Amigo Fiel', 'Pet Shop']]
      .map(([name]) => db.client.create({ data: { tenantId: tenant.id, name, type: 'PJ', city: 'Ribeirão Preto', state: 'SP' } })),
  );

  const palette = [['#0b1120', '#f9c21a'], ['#7c2d12', '#ffedd5'], ['#14532d', '#dcfce7'], ['#1e3a8a', '#dbeafe'], ['#581c87', '#f3e8ff']];
  const medias = [];
  for (const [i, c] of clients.entries()) {
    const [bg, fg] = palette[i];
    const fileH = await poster(`midias/demo-${i}-h.svg`, c.name, 'Campanha de demonstração', bg, fg);
    const fileV = await poster(`midias/demo-${i}-v.svg`, c.name, 'Campanha de demonstração', bg, fg, true);
    medias.push(await db.media.create({
      data: { tenantId: tenant.id, name: `Campanha ${c.name}`, type: 'arquivo', kind: 'image', fileH, fileV, thumb: fileH, clientId: c.id, duration: 15, width: 1920, height: 1080, size: 1200 },
    }));
  }

  const spots: [string, string, 'H' | 'V', number, number][] = [
    ['Academia Corpo Ativo — Recepção', 'Academias', 'H', -21.1775, -47.8103],
    ['Academia Corpo Ativo — Musculação', 'Academias', 'V', -21.1791, -47.8125],
    ['Restaurante Sabor da Praça', 'Restaurantes', 'H', -21.1702, -47.8099],
    ['Mercado Bom Preço — Caixas', 'Supermercados', 'H', -21.1923, -47.7961],
    ['Ótica Visão Clara', 'Ótica', 'V', -21.1836, -47.8212],
    ['Pet Shop Amigo Fiel', 'Pet Shop', 'H', -21.2011, -47.8033],
  ];
  const codes = ['DEMO01', 'DEMO02', 'DEMO03', 'DEMO04', 'DEMO05', 'DEMO06'];
  for (const [i, [name, seg, orientation, latitude, longitude]] of spots.entries()) {
    const screen = await db.screen.create({
      data: {
        tenantId: tenant.id, name, orientation, categoryId: cat[seg], latitude, longitude, city: 'Ribeirão Preto', state: 'SP',
        pairingCode: codes[i], favorite: i < 2, avgFlow: rnd(150, 900), clientId: clients[Math.min(i, clients.length - 1)].id,
      },
    });
    const playlist = [...medias, ...library.filter((l) => ['Hora certa', 'Previsão do tempo', 'Anuncie aqui', 'Saúde — Beba água'].includes(l.name))];
    await db.playlistItem.createMany({ data: playlist.map((m, position) => ({ screenId: screen.id, mediaId: m.id, position })) });
    // historico ficticio para os graficos
    const stats = [];
    for (let d = 1; d <= 330; d += d > 30 ? 9 : 1) for (const m of medias) stats.push({ screenId: screen.id, mediaId: m.id, date: day(d), count: rnd(120, 420) * (d > 30 ? 9 : 1) });
    await db.playStat.createMany({ data: stats });
    await db.screenUptime.createMany({ data: Array.from({ length: 7 }, (_, d) => ({ screenId: screen.id, date: day(d + 1), minutes: rnd(480, 900) })) });
  }
  console.log('Seed concluído. Acesse com admin@yesdooh.com.br / yesdooh123');
}

main().finally(() => db.$disconnect());
