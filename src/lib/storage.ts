import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';

const run = promisify(execFile);

/** Armazenamento local em disco. Para producao, troque por S3/Supabase Storage mantendo esta interface. */
export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || 'storage');

export const fileUrl = (key?: string | null) => (key ? `/api/arquivos/${key}` : null);

export function storagePath(key: string) {
  const p = path.resolve(STORAGE_DIR, key);
  if (!p.startsWith(STORAGE_DIR + path.sep)) throw new Error('Caminho inválido');
  return p;
}

export async function saveFile(file: File, folder: string) {
  const ext = (path.extname(file.name) || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  const dest = storagePath(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return key;
}

export async function removeFile(key?: string | null) {
  if (!key) return;
  await unlink(storagePath(key)).catch(() => {});
}

export const isUpload = (v: FormDataEntryValue | null): v is File => v instanceof File && v.size > 0;

/** Le duracao/dimensoes com ffprobe (quando disponivel no servidor). */
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

/** Gera miniatura JPG de um video (primeiro segundo). */
export async function videoThumb(key: string) {
  const out = key.replace(/\.[^.]+$/, '') + '-thumb.jpg';
  try {
    await run('ffmpeg', ['-y', '-ss', '1', '-i', storagePath(key), '-frames:v', '1', '-vf', 'scale=480:-2', storagePath(out)]);
    return out;
  } catch {
    return null;
  }
}
