import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

/** Videos prontos dos Conteudos dinamicos (arquivos em public/biblioteca, versao horizontal e vertical). */
export const LIBRARY_VIDEOS: { slug: string; name: string; library: string; duration: number }[] = [
  { slug: 'saude-voce-sabia', name: 'Saúde — Você sabia? (vacinas)', library: 'saude', duration: 15 },
  { slug: 'saude-quiz', name: 'Saúde — Quiz da saúde', library: 'saude', duration: 15 },
  { slug: 'saude-fique-atento', name: 'Saúde — Fique atento (vacinas)', library: 'saude', duration: 15 },
  { slug: 'todos-contra-dengue', name: 'Todos contra a dengue — vídeo', library: 'saude', duration: 15 },
  { slug: 'todos-contra-dengue-2', name: 'Todos contra a dengue — vídeo 2', library: 'saude', duration: 15 },
  { slug: 'academia-compromisso-no-treino', name: 'Academia — Compromisso no treino', library: 'marca', duration: 15 },
  { slug: 'ele-nao-desiste-de-voce', name: 'Ele não desiste de você', library: 'marca', duration: 15 },
  { slug: 'transito-seguro', name: 'Trânsito seguro — vídeo', library: 'marca', duration: 15 },
  { slug: 'valorize-quem-merece', name: 'Valorize quem merece', library: 'marca', duration: 15 },
  { slug: 'jesus-e-o-caminho', name: 'Jesus é o caminho', library: 'marca', duration: 15 },
  { slug: 'turismo', name: 'Turismo', library: 'diversos', duration: 10 },
  { slug: 'incrivel', name: 'Incrível', library: 'diversos', duration: 10 },
  { slug: 'tecnologia', name: 'Tecnologia', library: 'diversos', duration: 10 },
  { slug: 'esporte', name: 'Esporte', library: 'diversos', duration: 10 },
];

/** Cadastra na biblioteca os videos que ainda nao estao (roda no deploy; nao duplica nem recria os apagados de proposito). */
export async function ensureLibraryVideos(db: PrismaClient) {
  let added = 0;
  for (const v of LIBRARY_VIDEOS) {
    const fileH = `/biblioteca/${v.slug}-h.mp4`;
    const file = path.resolve('public', fileH.slice(1));
    if (!existsSync(file)) continue;
    if (await db.media.findFirst({ where: { tenantId: null, fileH } })) continue;
    await db.media.create({ data: { type: 'arquivo', kind: 'video', library: v.library, name: v.name, duration: v.duration, fileH, fileV: `/biblioteca/${v.slug}-v.mp4`, thumb: `/biblioteca/${v.slug}-thumb.jpg`, size: statSync(file).size, width: 1920, height: 1080, storeStats: false } });
    added++;
  }
  return added;
}
