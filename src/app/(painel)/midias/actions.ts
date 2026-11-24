'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, screenScope, type SessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { bool, num, parseJson, str, youtubeId } from '@/lib/util';
import { isRemoteKey, isUpload, probe, removeFile, saveFile, videoThumb } from '@/lib/storage';
import { MEDIA_TYPES } from '@/lib/constants';
import type { ActionResult } from '@/components/ui';

/** Marca as telas que exibem a midia (direto ou via grupo) para sincronizar de novo. */
async function bumpScreens(mediaId: string) {
  await db.screen.updateMany({
    where: { items: { some: { OR: [{ mediaId }, { group: { medias: { some: { mediaId } } } }] } } },
    data: { playlistVersion: { increment: 1 } },
  });
}

/** Inclusao rapida: deixa a midia exatamente nas telas marcadas (entra no fim da playlist). */
async function syncScreens(user: SessionUser, target: { mediaId: string } | { groupId: string }, screenIds: string[]) {
  const screens = await db.screen.findMany({ where: screenScope(user), select: { id: true, items: { select: { id: true, mediaId: true, groupId: true, position: true } } } });
  const match = (i: { mediaId: string | null; groupId: string | null }) => ('mediaId' in target ? i.mediaId === target.mediaId : i.groupId === target.groupId);
  for (const s of screens) {
    const has = s.items.filter(match);
    const want = screenIds.includes(s.id);
    if (want && !has.length) await db.playlistItem.create({ data: { screenId: s.id, ...target, position: Math.max(-1, ...s.items.map((i) => i.position)) + 1 } });
    else if (!want && has.length) await db.playlistItem.deleteMany({ where: { id: { in: has.map((i) => i.id) } } });
    else continue;
    await db.screen.update({ where: { id: s.id }, data: { playlistVersion: { increment: 1 } } });
  }
}

export async function saveMedia(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = str(fd, 'id');
  const current = id ? await db.media.findFirst({ where: { id, tenantId: user.tenantId } }) : null;
  if (id && !current) return { error: 'Mídia não encontrada.' };
  const type = current?.type ?? String(fd.get('type'));
  if (!MEDIA_TYPES[type]) return { error: 'Tipo de mídia inválido.' };

  const name = str(fd, 'name') ?? MEDIA_TYPES[type];
  const cfg = parseJson<Record<string, unknown>>(current?.config, {});
  const data: Record<string, unknown> = {
    name, clientId: str(fd, 'clientId'), categoryId: str(fd, 'categoryId'),
    storeStats: fd.has('hasStats') ? bool(fd, 'storeStats') : current?.storeStats ?? true,
    startDate: str(fd, 'startDate'), endDate: str(fd, 'endDate'), shiftStart: str(fd, 'shiftStart'), shiftEnd: str(fd, 'shiftEnd'), weekDays: str(fd, 'weekDays') ?? '',
  };
  if (data.startDate && data.endDate && (data.startDate as string) > (data.endDate as string)) return { error: 'A data final deve ser depois da inicial.' };
  let duration = num(fd, 'duration');

  if (type === 'arquivo') {
    for (const side of ['fileH', 'fileV'] as const) {
      // modo nuvem: o navegador ja enviou o arquivo; chegam aqui o endereco e os dados lidos no navegador
      const remoteUrl = str(fd, `${side}_url`);
      if (remoteUrl) {
        if (!isRemoteKey(remoteUrl)) return { error: 'Endereço de arquivo inválido.' };
        const meta = parseJson<{ kind?: string; width?: number; height?: number; duration?: number; size?: number; thumb?: string }>(str(fd, `${side}_meta`), {});
        if (current) await removeFile(current[side]);
        data[side] = remoteUrl;
        data.kind = meta.kind === 'video' ? 'video' : 'image';
        if (side === 'fileH' || !data.size) Object.assign(data, { size: Math.round(Number(meta.size) || 0) || null, width: Math.round(Number(meta.width) || 0) || null, height: Math.round(Number(meta.height) || 0) || null });
        if (data.kind === 'video') {
          if (Number(meta.duration) > 0) duration = Math.round(Number(meta.duration));
          if ((side === 'fileH' || !data.thumb) && typeof meta.thumb === 'string' && meta.thumb.startsWith('data:image/jpeg;base64,') && meta.thumb.length < 400_000)
            data.thumb = await saveFile(new File([Buffer.from(meta.thumb.split(',')[1], 'base64')], 'thumb.jpg', { type: 'image/jpeg' }), 'midias');
        } else if (side === 'fileH' || !data.thumb) data.thumb = remoteUrl;
        continue;
      }
      const f = fd.get(side);
      if (!isUpload(f)) continue;
      if (!/^(image|video)\//.test(f.type)) return { error: 'Envie apenas arquivos de imagem ou vídeo.' };
      if (current) await removeFile(current[side]);
      const key = await saveFile(f, 'midias');
      const meta = await probe(key);
      data[side] = key;
      data.kind = f.type.startsWith('video/') ? 'video' : 'image';
      if (side === 'fileH' || !data.size) Object.assign(data, { size: meta.size, width: meta.width, height: meta.height });
      if (data.kind === 'video') {
        if (meta.duration) duration = Math.round(meta.duration); // video usa a duracao real
        if (side === 'fileH' || !data.thumb) data.thumb = await videoThumb(key);
      } else if (side === 'fileH' || !data.thumb) data.thumb = key;
    }
    if (!current && !data.fileH && !data.fileV) return { error: 'Envie ao menos um arquivo (horizontal ou vertical).' };
  }
  if (type === 'youtube') {
    const url = str(fd, 'url');
    if (!url || !youtubeId(url)) return { error: 'Informe um link válido do YouTube.' };
    data.url = url;
  }
  if (type === 'link' || type === 'rss') {
    const url = str(fd, 'url');
    if (!url || !/^https?:\/\//.test(url)) return { error: 'Informe um endereço começando com http:// ou https://.' };
    data.url = url;
  }
  if (type === 'aviso') Object.assign(cfg, { title: name, showTitle: bool(fd, 'showTitle'), text: str(fd, 'text') ?? '', bg: str(fd, 'bg'), titleColor: str(fd, 'titleColor'), textColor: str(fd, 'textColor'), fontSize: str(fd, 'fontSize') ?? 'padrao' });
  if (type === 'rss') Object.assign(cfg, { source: str(fd, 'source') ?? '', bg: str(fd, 'bg'), color: str(fd, 'color') });
  if (['hora', 'dolar', 'clima'].includes(type)) Object.assign(cfg, { bg: str(fd, 'bg'), color: str(fd, 'color') });
  if (type === 'clima') {
    const city = str(fd, 'city');
    if (!city) { delete cfg.city; delete cfg.lat; delete cfg.lon; }
    else if (city !== cfg.city || typeof cfg.lat !== 'number') {
      const place = await geocodeCity(city);
      if (!place) return { error: `Não encontrei a cidade "${city}". Escreva assim: Igarapava - SP.` };
      Object.assign(cfg, place);
    }
  }
  if (['aviso', 'rss', 'hora'].includes(type) && isUpload(fd.get('image'))) {
    await removeFile(cfg.image as string | undefined);
    cfg.image = await saveFile(fd.get('image') as File, 'midias');
  }
  data.config = JSON.stringify(cfg);
  data.duration = Math.max(3, Math.min(3600, duration ?? current?.duration ?? 15));

  const media = current
    ? await db.media.update({ where: { id: current.id }, data })
    : await db.media.create({ data: { ...(data as { name: string }), type, tenantId: user.tenantId } });
  if (fd.has('hasScreens')) await syncScreens(user, { mediaId: media.id }, fd.getAll('screens').map(String));
  await bumpScreens(media.id);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Salvo.' };
}

/** So as telas da midia (quadro "Telas onde passa" e botao Telas da lista). */
export async function saveMediaScreens(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const m = await db.media.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!m) return { error: 'Mídia não encontrada.' };
  const ids = fd.getAll('screens').map(String);
  await syncScreens(user, { mediaId: m.id }, ids);
  revalidatePath('/', 'layout');
  return { ok: true, message: ids.length ? `Mídia em ${ids.length} tela(s). As telas recebem a mudança na próxima sincronização.` : 'Mídia retirada de todas as telas.' };
}

export async function toggleMedia(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const m = await db.media.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!m) return { error: 'Mídia não encontrada.' };
  await db.media.update({ where: { id: m.id }, data: { active: !m.active } });
  await bumpScreens(m.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteMedia(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const m = await db.media.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!m) return { error: 'Mídia não encontrada.' };
  await bumpScreens(m.id);
  await db.media.delete({ where: { id: m.id } });
  await Promise.all([removeFile(m.fileH), removeFile(m.fileV), m.thumb !== m.fileH ? removeFile(m.thumb) : null, removeFile(parseJson<{ image?: string }>(m.config, {}).image)]);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveMediaNotes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await db.media.updateMany({ where: { id: String(fd.get('id')), tenantId: user.tenantId }, data: { notes: String(fd.get('notes') ?? '') } });
  return { ok: true, message: 'Anotações salvas.' };
}

/** Biblioteca: inclui/retira um conteudo dinamico das telas marcadas. */
export async function includeLibrary(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const m = await db.media.findFirst({ where: { id: String(fd.get('id')), tenantId: null } });
  if (!m) return { error: 'Conteúdo não encontrado.' };
  await syncScreens(user, { mediaId: m.id }, fd.getAll('screens').map(String));
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveGroup(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = str(fd, 'id');
  const current = id ? await db.mediaGroup.findFirst({ where: { id, tenantId: user.tenantId } }) : null;
  if (id && !current) return { error: 'Grupo não encontrado.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Informe o nome do grupo.' };
  const mediaIds = (await db.media.findMany({ where: { id: { in: fd.getAll('medias').map(String) }, tenantId: user.tenantId }, select: { id: true } })).map((m) => m.id);
  if (!mediaIds.length) return { error: 'Escolha ao menos uma mídia para o grupo.' };
  let image = current?.image ?? null;
  if (isUpload(fd.get('image'))) { await removeFile(image); image = await saveFile(fd.get('image') as File, 'grupos'); }
  const group = current
    ? await db.mediaGroup.update({ where: { id: current.id }, data: { name, image } })
    : await db.mediaGroup.create({ data: { name, image, tenantId: user.tenantId } });
  await db.mediaGroupItem.deleteMany({ where: { groupId: group.id } });
  await db.mediaGroupItem.createMany({ data: mediaIds.map((mediaId, position) => ({ groupId: group.id, mediaId, position })) });
  await syncScreens(user, { groupId: group.id }, fd.getAll('screens').map(String));
  await db.screen.updateMany({ where: { items: { some: { groupId: group.id } } }, data: { playlistVersion: { increment: 1 } } });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteGroup(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const g = await db.mediaGroup.findFirst({ where: { id: String(fd.get('id')), tenantId: user.tenantId } });
  if (!g) return { error: 'Grupo não encontrado.' };
  await db.screen.updateMany({ where: { items: { some: { groupId: g.id } } }, data: { playlistVersion: { increment: 1 } } });
  await db.mediaGroup.delete({ where: { id: g.id } });
  await removeFile(g.image);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Acha a cidade (Brasil) para a previsao do tempo. Aceita "Cidade - UF", "Cidade/UF" ou so "Cidade". */
async function geocodeCity(input: string): Promise<{ city: string; lat: number; lon: number } | null> {
  const [rawName, rawUf] = input.split(/\s*[-/,]\s*/);
  const uf = rawUf?.trim().toUpperCase();
  const UF: Record<string, string> = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(rawName.trim())}&count=10&language=pt&countryCode=BR`, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string }[] };
    const list = j.results ?? [];
    const hit = (uf && UF[uf] ? list.find((r) => r.admin1 === UF[uf]) : null) ?? list[0];
    if (!hit) return null;
    const sigla = Object.keys(UF).find((k) => UF[k] === hit.admin1);
    return { city: `${hit.name}${sigla ? '/' + sigla : ''}`, lat: hit.latitude, lon: hit.longitude };
  } catch {
    return null;
  }
}
