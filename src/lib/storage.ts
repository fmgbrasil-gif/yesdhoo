import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import { del, put } from '@vercel/blob';

const run = promisify(execFile);

/**
 * Armazenamento de arquivos com dois modos:
 * - local: pasta em disco (desenvolvimento, Docker, Railway) — a chave e um caminho relativo;
 * - nuvem: Vercel Blob, ativado quando existe BLOB_READ_WRITE_TOKEN — a chave e a URL publica do arquivo.
 */
export const REMOTE = !!process.env.BLOB_READ_WRITE_TOKEN;
export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || 'storage');
const BLOB_HOST = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

export const isRemoteKey = (key?: string | null): key is string => !!key && BLOB_HOST.test(key);
// '/brand/...' sao imagens fixas do proprio sistema (pasta public/brand), como a logo da plataforma
export const fileUrl = (key?: string | null) => (!key ? null : isRemoteKey(key) || /^\/brand\/[\w.-]+$/.test(key) ? key : `/api/arquivos/${key}`);

export function storagePath(key: string) {
  const p = path.resolve(STORAGE_DIR, key);
  if (!p.startsWith(STORAGE_DIR + path.sep)) throw new Error('Caminho inválido');
  return p;
}

function newKey(name: string, folder: string) {
  const ext = (path.extname(name) || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  return `${folder}/${crypto.randomUUID()}${ext}`;
}

export async function saveFile(file: File, folder: string) {
  const key = newKey(file.name, folder);
  if (REMOTE) return (await put(key, file, { access: 'public', contentType: file.type || undefined })).url;
  const dest = storagePath(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return key;
}

export async function removeFile(key?: string | null) {
  if (!key) return;
  if (isRemoteKey(key)) { if (REMOTE) await del(key).catch(() => {}); return; }
  if (/^https?:/.test(key)) return;
  await unlink(storagePath(key)).catch(() => {});
}

export const isUpload = (v: FormDataEntryValue | null): v is File => v instanceof File && v.size > 0;

/** Le duracao/dimensoes com ffprobe (modo local, quando o ffprobe existe no servidor). */
export async function probe(key: string) {
  const p = storagePath(key);
  const size = (await stat(p)).size;
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', p]);
    const j = JSON.parse(stdout);
    const d = Number(j.format?.duration);
    return { size, width: j.streams?.[0]?.width as number | undefined, height: j.streams?.[0]?.height as number | undefined, duration: Number.isFinite(d) ? d : undefined };
  } catch {
    return { size, width: undefined, height: undefined, duration: undefined };
  }
}

/** Gera miniatura JPG de um video (modo local). */
export async function videoThumb(key: string) {
  const out = key.replace(/\.[^.]+$/, '') + '-thumb.jpg';
  try {
    await run('ffmpeg', ['-y', '-ss', '1', '-i', storagePath(key), '-frames:v', '1', '-vf', 'scale=480:-2', storagePath(out)]);
    return out;
  } catch {
    return null;
  }
}

/** Logos fixas do sistema que tem versao clara para fundo escuro (menu lateral, tela de login). */
const ON_DARK: Record<string, string> = { '/brand/yes.png': '/brand/yes-white.png' };
export const logoOnDark = (url: string | null) => (url ? ON_DARK[url] ?? url : null);
/** Logo "larga" do sistema (sem caixa branca e sem o nome ao lado). */
export const isBrandLogo = (url: string | null) => !!url && url.startsWith('/brand/');
