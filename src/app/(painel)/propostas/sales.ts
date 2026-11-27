'use server';

import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { networkStats } from '@/lib/proposal';
import { folderToken } from '@/lib/folder';
import { salesContext, salesReply, type ChatMsg } from '@/lib/sales-ai';

/** Assistente "Me ajude a vender": responde com base na rede e na proposta (se houver). */
export async function salesChat(proposalId: string | null, messages: ChatMsg[]): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const clean = (Array.isArray(messages) ? messages : []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-20);
  if (!clean.length || clean[clean.length - 1].role !== 'user') return { ok: false, error: 'Escreva sua mensagem.' };
  const p = proposalId ? await db.proposal.findFirst({ where: { id: proposalId, tenantId: user.tenantId } }) : null;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const ctx = salesContext(user.tenant, await networkStats(user.tenantId), p, { proposal: p ? `${origin}/proposta/${p.publicToken}` : undefined, folder: `${origin}/folder/${folderToken(user.tenantId)}` });
  try {
    return { ok: true, text: await salesReply(user.tenant, ctx, clean) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível responder agora.' };
  }
}
