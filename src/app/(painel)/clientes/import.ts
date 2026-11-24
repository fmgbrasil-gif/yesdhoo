'use server';

import { requireUser } from '@/lib/auth';
import { readAttachments } from '@/lib/charges';
import { readClientDocs, type ClientDraft } from '@/lib/ai-client';

/** Le o comprovante de CNPJ (cartao CNPJ salvo do site da Receita, PDF ou imagem) e devolve os dados do cadastro. */
export async function importCnpjCard(fd: FormData): Promise<{ ok: true; draft: ClientDraft; notes: string[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const files = await readAttachments(fd, 'card');
  if (typeof files === 'string') return { ok: false, error: files };
  if (!files.length) return { ok: false, error: 'Escolha o PDF do comprovante de CNPJ.' };
  try {
    return { ok: true, ...(await readClientDocs(user.tenant, files)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível ler o arquivo.' };
  }
}
