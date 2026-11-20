/**
 * Gera o "Pix Copia e Cola" (BR Code, padrao EMV do Banco Central) para uma chave Pix,
 * com valor e identificador da cobranca. Funciona com qualquer banco, sem integracao.
 */
function field(id: string, value: string) {
  return id + String(value.length).padStart(2, '0') + value;
}

/** CRC16-CCITT (polinomio 0x1021, inicial 0xFFFF), exigido no final do BR Code. */
export function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Nome e cidade no BR Code: sem acentos, maiusculas, tamanho limitado. */
const clean = (s: string, max: number) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);

export function pixPayload({ key, name, city, amountCents, txid, description }: { key: string; name: string; city: string; amountCents?: number; txid?: string; description?: string }) {
  const account = field('00', 'br.gov.bcb.pix') + field('01', key.trim()) + (description ? field('02', clean(description, 40)) : '');
  const tx = (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amountCents ? field('54', (amountCents / 100).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', clean(name, 25) || 'RECEBEDOR') +
    field('60', clean(city, 15) || 'BRASIL') +
    field('62', field('05', tx)) +
    '6304';
  return body + crc16(body);
}

/** Valida o formato de uma chave Pix (CPF, CNPJ, e-mail, telefone ou chave aleatoria). */
export function pixKeyProblem(key: string) {
  const k = key.trim();
  if (!k) return 'Informe a chave Pix.';
  if (/^\d{11}$/.test(k) || /^\d{14}$/.test(k)) return null; // CPF / CNPJ (so numeros)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) && k.length <= 77) return null;
  if (/^\+55\d{10,11}$/.test(k)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return null;
  return 'Chave Pix inválida. Use CPF ou CNPJ só com números, e-mail, telefone no formato +5516999999999 ou a chave aleatória.';
}
