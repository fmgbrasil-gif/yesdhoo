import crypto from 'node:crypto';

/** Criptografa segredos guardados no banco (ex.: chave da API do banco) com AES-256-GCM. */
function key(secret = process.env.AUTH_SECRET || 'somente-desenvolvimento') {
  return crypto.createHash('sha256').update('yesdooh-secrets:' + secret).digest();
}

/** Segredo proprio das chaves de assinatura (nao muda se o AUTH_SECRET for trocado). */
export const signingSecret = () => process.env.SIGNING_KEY_SECRET || process.env.AUTH_SECRET || 'somente-desenvolvimento';

export function encrypt(plain: string, secret?: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(secret), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(blob: string | null | undefined, secret?: string) {
  if (!blob) return null;
  try {
    const [v, iv, tag, data] = blob.split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

/** Mostra so o final de um segredo (ex.: "••••a1b2"). */
export const mask = (s: string | null | undefined) => (s ? '••••' + s.slice(-4) : '');
