import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt, signingSecret } from '@/lib/crypto';

/** Baixa o arquivo da chave do app (so o administrador da plataforma). */
export async function GET() {
  const user = await getUser();
  if (!user?.superAdmin) return new Response('Acesso restrito ao administrador da plataforma.', { status: 403 });
  const k = await db.signingKey.findUnique({ where: { name: 'android' } });
  const b64 = k ? decrypt(k.keystoreEnc, signingSecret()) : null;
  if (!k || !b64) return new Response('Chave não encontrada.', { status: 404 });
  return new Response(new Uint8Array(Buffer.from(b64, 'base64')), {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${k.fileName.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'no-store' },
  });
}
