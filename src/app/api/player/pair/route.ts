import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { cleanInfo } from '@/lib/player';
import { PAIR_RULE, clientIp, lockedFor, registerFailure } from '@/lib/security';

/** Pareia um dispositivo com uma tela usando o codigo exibido no painel. */
export async function POST(req: Request) {
  const key = `pair:${await clientIp()}`;
  const wait = await lockedFor(key); // barra quem tenta adivinhar codigos
  if (wait) return Response.json({ error: `Muitas tentativas. Aguarde ${wait} minuto(s).` }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return Response.json({ error: 'Código inválido.' }, { status: 400 });
  const screen = await db.screen.findUnique({ where: { pairingCode: code } });
  if (!screen) {
    await registerFailure(key, PAIR_RULE);
    return Response.json({ error: 'Código não encontrado. Confira no painel.' }, { status: 404 });
  }
  if (screen.deviceToken) return Response.json({ error: 'Esta tela já está pareada com outro dispositivo. Use “Resetar” no painel para liberar.' }, { status: 409 });
  const token = crypto.randomBytes(32).toString('hex');
  await db.screen.update({ where: { id: screen.id }, data: { deviceToken: token, deviceInfo: cleanInfo(body.info), lastSeenAt: new Date() } });
  return Response.json({ token, name: screen.name });
}
