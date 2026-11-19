import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { storagePath } from '@/lib/storage';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
};

/** Serve arquivos do armazenamento local com suporte a Range (necessario para video). */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const key = (await params).path.join('/');
    const file = storagePath(key);
    const { size } = await stat(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' };
    const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
      return new Response(stream, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
    }
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...base, 'Content-Length': String(size) } });
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }
}
