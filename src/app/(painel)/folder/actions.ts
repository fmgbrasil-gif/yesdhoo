'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { folderConfig, type FolderConfig } from '@/lib/folder';
import { isUpload, removeFile, saveFile } from '@/lib/storage';
import type { ActionResult } from '@/components/ui';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const on = (fd: FormData, k: string) => fd.get(k) === 'on';
const color = (v: string, def: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : def);

/** Uma imagem do folder: troca pela nova, remove se marcado ou mantem a atual. */
async function image(fd: FormData, field: string, current: string | null) {
  const f = fd.get(field);
  if (isUpload(f)) {
    if (!(f as File).type.startsWith('image/')) throw new Error('Envie apenas imagens (JPG ou PNG).');
    await removeFile(current);
    return saveFile(f as File, 'folder');
  }
  if (on(fd, `remove_${field}`)) { await removeFile(current); return null; }
  return current;
}

/** Salva o folder promocional (textos, cores, planos, contato e imagens). */
export async function saveFolder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const old = folderConfig(user.tenant.folder);
  try {
    const removeLogos = new Set(fd.getAll('remove_logo').map(String));
    for (const k of old.clients.logos.filter((k) => removeLogos.has(k))) await removeFile(k);
    const keep = old.clients.logos.filter((k) => !removeLogos.has(k));
    const newLogos = fd.getAll('client_logos').filter(isUpload) as File[];
    if (keep.length + newLogos.length > 16) return { error: `O folder aceita até 16 logos de clientes (já tem ${keep.length}).` };
    const added: string[] = [];
    for (const f of newLogos) added.push(await saveFile(f, 'folder'));

    const removeGallery = new Set(fd.getAll('remove_gallery').map(String));
    for (const k of old.gallery.photos.filter((k) => removeGallery.has(k))) await removeFile(k);
    const keepG = old.gallery.photos.filter((k) => !removeGallery.has(k));
    const newG = fd.getAll('gallery_photos').filter(isUpload) as File[];
    if (keepG.length + newG.length > 8) return { error: `A galeria aceita até 8 fotos de telas instaladas (já tem ${keepG.length}).` };
    const addedG: string[] = [];
    for (const f of newG) addedG.push(await saveFile(f, 'folder'));

    const cfg: FolderConfig = {
      colors: { primary: color(s(fd, 'primary'), old.colors.primary), dark: color(s(fd, 'dark'), old.colors.dark) },
      cover: { title: s(fd, 'cover_title'), subtitle: s(fd, 'cover_subtitle'), tagline: s(fd, 'cover_tagline'), image: await image(fd, 'cover_image', old.cover.image), logo: await image(fd, 'cover_logo', old.cover.logo) },
      about: { show: on(fd, 'about_show'), title: s(fd, 'about_title'), text: s(fd, 'about_text'), image: await image(fd, 'about_image', old.about.image) },
      stats: { auto: on(fd, 'stats_auto'), items: [0, 1, 2, 3].map((i) => ({ value: s(fd, `stat_value_${i}`), label: s(fd, `stat_label_${i}`) })) },
      network: {
        show: on(fd, 'network_show'), title: s(fd, 'network_title'), text: s(fd, 'network_text'), cities: s(fd, 'net_cities'), peopleDay: s(fd, 'net_people_day'), peopleMonth: s(fd, 'net_people_month'),
        segments: s(fd, 'net_segments'), days: s(fd, 'net_days'), hoursDay: s(fd, 'net_hours_day'), insertionsDay: s(fd, 'net_insertions_day'), screens: s(fd, 'net_screens'),
        extra: [0, 1, 2, 3].map((i) => ({ value: s(fd, `net_extra_value_${i}`), label: s(fd, `net_extra_label_${i}`) })),
      },
      gallery: { show: on(fd, 'gallery_show'), title: s(fd, 'gallery_title'), text: s(fd, 'gallery_text'), photos: [...keepG, ...addedG] },
      benefits: { show: on(fd, 'benefits_show'), title: s(fd, 'benefits_title'), items: [0, 1, 2, 3].map((i) => ({ title: s(fd, `benefit_title_${i}`), text: s(fd, `benefit_text_${i}`) })) },
      points: { title: s(fd, 'points_title'), intro: s(fd, 'points_intro'), perPage: s(fd, 'points_per') === '2' ? 2 : 4, showAddress: on(fd, 'points_address'), showFlow: on(fd, 'points_flow'), showHours: on(fd, 'points_hours') },
      plans: {
        show: on(fd, 'plans_show'), title: s(fd, 'plans_title'), intro: s(fd, 'plans_intro'), showPrices: on(fd, 'plans_prices'), note: s(fd, 'plans_note'),
        items: [0, 1, 2, 3].map((i) => ({ name: s(fd, `plan_name_${i}`), desc: s(fd, `plan_desc_${i}`), duration: s(fd, `plan_duration_${i}`), insertions: s(fd, `plan_insertions_${i}`), price: s(fd, `plan_price_${i}`), highlight: s(fd, 'plan_highlight') === String(i) })),
      },
      specs: { show: on(fd, 'specs_show') },
      clients: { show: on(fd, 'clients_show'), title: s(fd, 'clients_title'), logos: [...keep, ...added] },
      proposalPages: old.proposalPages,
      contact: { title: s(fd, 'contact_title'), text: s(fd, 'contact_text'), phone: s(fd, 'contact_phone'), whatsapp: s(fd, 'contact_whatsapp'), email: s(fd, 'contact_email'), instagram: s(fd, 'contact_instagram'), site: s(fd, 'contact_site'), address: s(fd, 'contact_address') },
    };
    await db.tenant.update({ where: { id: user.tenantId }, data: { folder: JSON.stringify(cfg) } });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível salvar o folder.' };
  }
  revalidatePath('/folder');
  return { ok: true, message: 'Folder salvo. Abra “Ver folder” para conferir.' };
}

/** Volta os textos e cores ao padrao (mantem as imagens enviadas). */
export async function resetFolderTexts(): Promise<ActionResult> {
  const user = await requireAdmin();
  const old = folderConfig(user.tenant.folder);
  const def = folderConfig('{}');
  def.cover.image = old.cover.image; def.cover.logo = old.cover.logo; def.about.image = old.about.image; def.clients.logos = old.clients.logos; def.gallery.photos = old.gallery.photos; def.proposalPages = old.proposalPages;
  await db.tenant.update({ where: { id: user.tenantId }, data: { folder: JSON.stringify(def) } });
  revalidatePath('/folder');
  return { ok: true, message: 'Textos e cores voltaram ao padrão.' };
}
