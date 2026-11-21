import type { Contract } from '@prisma/client';
import { fmtDoc } from './docs';
import type { PdfSignature } from './pdf-client';

export const SIGN_LABEL: Record<string, string> = { pendente: 'Aguardando assinatura', assinado: 'Assinado', recusado: 'Recusado' };

const when = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(d);

/** Dados da assinatura eletronica para mostrar na tela e no PDF (null se ainda nao assinado). */
export function signatureInfo(c: Contract): PdfSignature | null {
  if (c.signStatus !== 'assinado' || !c.signature || !c.signedAt) return null;
  return { image: c.signature, name: c.signerName ?? '', doc: `${(c.signerDoc ?? '').length === 14 ? 'CNPJ' : 'CPF'} ${fmtDoc(c.signerDoc)}`, when: `${when(c.signedAt)} (horário de Brasília)`, ip: c.signerIp, hash: c.bodyHash };
}

export const refusedWhen = (c: Contract) => (c.refusedAt ? when(c.refusedAt) : '');
