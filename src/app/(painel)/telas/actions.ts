'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, screenScope, type SessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { bool, num, pairingCode, parseJson, slugify, str } from '@/lib/util';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import { COMMANDS } from '@/lib/constants';
import type { ActionResult } from '@/components/ui';

async function ownScreen(user: SessionUser, id: string) {
  const screen = await db.screen.findFirst({ where: { ...screenScope(user), id } });
  if (!screen) throw new Error('Tela não encontrada');
  return screen;
}

function screenData(fd: FormData) {
  return {
    name: str(fd, 'name') ?? '',
    orientation: fd.get('orientation') === 'V' ? 'V' : 'H',
    rotation: ['0', '90', '180', '270'].includes(String(fd.get('rotation'))) ? String(fd.get('rotation')) : 'auto',
    phone1: str(fd, 'phone1'), phone2: str(fd, 'phone2'),
    road: str(fd, 'road'), number: str(fd, 'number'), complement: str(fd, 'complement'), neighborhood: str(fd, 'neighborhood'),
    zipcode: str(fd, 'zipcode'), city: str(fd, 'city'), state: str(fd, 'state'),
    latitude: num(fd, 'latitude'), longitude: num(fd, 'longitude'),
    categoryId: str(fd, 'categoryId'), clientId: str(fd, 'clientId'),
    workStart: str(fd, 'workStart'), workEnd: str(fd, 'workEnd'), weekDays: str(fd, 'weekDays') ?? '',
    avgFlow: num(fd, 'avgFlow'),
    timezone: str(fd, 'timezone') ?? 'America/Sao_Paulo',
    updateFrequency: num(fd, 'updateFrequency') ?? 10,
    audioEnabled: bool(fd, 'audioEnabled'),
    footerEnabled: bool(fd, 'footerEnabled'), footerText: str(fd, 'footerText') ?? '', footerBg: str(fd, 'footerBg') ?? '#000000',
    companyName: str(fd, 'companyName'), promoText: str(fd, 'promoText') ?? '', promoInclude: fd.has('promoInclude') ? bool(fd, 'promoInclude') : true,
    footerColor: str(fd, 'footerColor') ?? '#FFFFFF', footerClock: bool(fd, 'footerClock'), footerWeather: bool(fd, 'footerWeather'),
  };
}

/** Fotos do ponto para o relatorio promocional: remove as marcadas e acrescenta as novas (maximo 4). */
async function savePhotos(fd: FormData, current: string[]): Promise<{ keys: string[] } | { error: string }> {
  const remove = new Set(fd.getAll('removePhoto').map(String));
  const keep = current.filter((k) => !remove.has(k));
  const files = fd.getAll('photos').filter(isUpload) as File[];
  if (keep.length + files.length > 4) return { error: `Cada ponto aceita até 4 fotos (já tem ${keep.length}). Remova alguma antes de enviar novas.` };
  if (files.some((f) => !f.type.startsWith('image/'))) return { error: 'As fotos do ponto precisam ser imagens (JPG ou PNG).' };
  for (const k of current.filter((k) => remove.has(k))) await removeFile(k);
  const added = [];
  for (const f of files) added.push(await saveFile(f, 'pontos'));
  return { keys: [...keep, ...added] };
}

async function uniqueCode() {
  for (;;) {
    const code = pairingCode();
    if (!(await db.screen.findUnique({ where: { pairingCode: code } }))) return code;
  }
}

export async function createScreen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const data = screenData(fd);
  if (!data.name) return { error: 'Informe o nome da tela.' };
  const count = await db.screen.count({ where: { tenantId: user.tenantId } });
  if (count >= user.tenant.planScreens) return { error: `Seu plano permite ${user.tenant.planScreens} telas. Amplie o plano para cadastrar mais.` };
  const image = isUpload(fd.get('image')) ? await saveFile(fd.get('image') as File, 'telas') : null;
  const photos = await savePhotos(fd, []);
  if ('error' in photos) return photos;
  const screen = await db.screen.create({ data: { ...data, image, photos: JSON.stringify(photos.keys), tenantId: user.tenantId, pairingCode: await uniqueCode() } });
  redirect(`/telas/${screen.id}`);
}

export async function updateScreen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const screen = await ownScreen(user, String(fd.get('id')));
  const data = screenData(fd);
  if (!data.name) return { error: 'Informe o nome da tela.' };
  let image = screen.image;
  if (isUpload(fd.get('image'))) { await removeFile(image); image = await saveFile(fd.get('image') as File, 'telas'); }
  const photos = await savePhotos(fd, parseJson<string[]>(screen.photos, []));
  if ('error' in photos) return photos;
  await db.screen.update({ where: { id: screen.id }, data: { ...data, image, photos: JSON.stringify(photos.keys), playlistVersion: { increment: 1 } } });
  revalidatePath('/telas', 'layout');
  return { ok: true };
}

export async function toggleFavorite(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const screen = await ownScreen(await requireUser(), String(fd.get('id')));
  await db.screen.update({ where: { id: screen.id }, data: { favorite: !screen.favorite } });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Desvincula o dispositivo: a tela volta a aguardar pareamento com um novo codigo. */
export async function resetScreen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const screen = await ownScreen(await requireUser(), String(fd.get('id')));
  if (fd.get('confirmPhrase') !== `resetar:${slugify(screen.name)}`) return { error: 'Frase de confirmação incorreta.' };
  await db.screen.update({ where: { id: screen.id }, data: { deviceToken: null, deviceInfo: '{}', lastSeenAt: null, syncedAt: null, syncedVersion: 0, pairingCode: await uniqueCode() } });
  revalidatePath('/telas', 'layout');
  return { ok: true };
}

export async function deleteScreen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const screen = await ownScreen(await requireUser(), String(fd.get('id')));
  if (fd.get('confirmPhrase') !== `excluir:${slugify(screen.name)}`) return { error: 'Frase de confirmação incorreta.' };
  await Promise.all([removeFile(screen.image), removeFile(screen.screenshot)]);
  await db.screen.delete({ where: { id: screen.id } });
  redirect('/telas');
}

export async function sendCommand(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const screen = await ownScreen(user, String(fd.get('id')));
  const type = String(fd.get('type'));
  if (!COMMANDS[type]) return { error: 'Comando inválido.' };
  if (!screen.deviceToken) return { error: 'Esta tela ainda não foi pareada com um dispositivo.' };
  await db.command.create({ data: { screenId: screen.id, userId: user.id, type } });
  revalidatePath(`/telas/${screen.id}`);
  return { ok: true };
}

export async function saveScreenNotes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const screen = await ownScreen(await requireUser(), String(fd.get('id')));
  await db.screen.update({ where: { id: screen.id }, data: { notes: String(fd.get('notes') ?? '') } });
  return { ok: true, message: 'Anotações salvas.' };
}

/** Substitui a playlist da tela. `items` = JSON com chaves "m:<midia>" ou "g:<grupo>" na ordem de exibicao. */
export async function savePlaylist(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const screen = await ownScreen(user, String(fd.get('id')));
  let keys: string[];
  try { keys = JSON.parse(String(fd.get('items'))); } catch { return { error: 'Playlist inválida.' }; }
  const mediaIds = keys.filter((k) => k.startsWith('m:')).map((k) => k.slice(2));
  const groupIds = keys.filter((k) => k.startsWith('g:')).map((k) => k.slice(2));
  const [medias, groups] = await Promise.all([
    db.media.findMany({ where: { id: { in: mediaIds }, OR: [{ tenantId: user.tenantId }, { tenantId: null }] }, select: { id: true } }),
    db.mediaGroup.findMany({ where: { id: { in: groupIds }, tenantId: user.tenantId }, select: { id: true } }),
  ]);
  const okM = new Set(medias.map((m) => m.id));
  const okG = new Set(groups.map((g) => g.id));
  const rows = keys
    .map((k) => (k.startsWith('m:') && okM.has(k.slice(2)) ? { mediaId: k.slice(2) } : k.startsWith('g:') && okG.has(k.slice(2)) ? { groupId: k.slice(2) } : null))
    .filter((r): r is { mediaId: string } | { groupId: string } => !!r)
    .map((r, position) => ({ ...r, screenId: screen.id, position }));
  await db.$transaction([
    db.playlistItem.deleteMany({ where: { screenId: screen.id } }),
    db.playlistItem.createMany({ data: rows }),
    db.screen.update({ where: { id: screen.id }, data: { playlistVersion: { increment: 1 } } }),
  ]);
  revalidatePath(`/telas/${screen.id}`, 'layout');
  return { ok: true, message: 'Playlist salva. A tela será atualizada na próxima sincronização.' };
}
