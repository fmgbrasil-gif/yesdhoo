import type { Proposal, Tenant } from '@prisma/client';
import { OPENAI_BASE, openaiKey } from './ai-contract';
import { fmtMoney } from './money';
import { parseJson } from './util';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

const SYSTEM = `Você é o assistente de vendas de uma empresa de mídia indoor (telas digitais em academias, restaurantes, supermercados, lojas). Você ajuda o vendedor (usuário) a vender anúncios para pequenos e médios negócios locais pelo WhatsApp.

Como trabalhar:
- Responda sempre em português do Brasil, direto e prático.
- Quando o vendedor pedir uma mensagem para o cliente, entregue a mensagem PRONTA para copiar e colar no WhatsApp, dentro de um bloco que começa com a linha "MENSAGEM:" e termina antes de qualquer comentário seu. Sem emojis. Pode usar *negrito* do WhatsApp com moderação. Tom cordial, próximo e confiante, frases curtas, no máximo 6 linhas, sempre terminando com uma pergunta ou um próximo passo claro.
- Personalize com o que o vendedor contar do cliente (segmento, público, objetivo, momento do negócio, objeções).
- Quando o vendedor colar uma pergunta ou objeção do cliente ("está caro", "vou pensar", "não sei se funciona", "quantas pessoas veem?"), explique em 1 ou 2 linhas a estratégia e entregue a resposta pronta (MENSAGEM:).
- Use somente os números e condições informados no contexto abaixo. Nunca invente números, descontos, prazos ou garantias. Se faltar um dado, diga ao vendedor para confirmar.
- Argumentos úteis: atenção garantida do público parado/esperando, alta frequência (várias exibições por hora), presença em vários pontos da cidade, custo baixo por exibição comparado a outras mídias, relatório mensal de veiculações, troca da arte quando quiser, produção do vídeo pode ser combinada.
- Se fizer sentido, sugira o próximo passo: enviar a proposta pelo link, marcar uma visita, mostrar uma tela funcionando.`;

/** Contexto da rede e (se houver) da proposta, para a IA nao inventar numeros. */
export function salesContext(t: Tenant, net: { points: number; screens: number; daily: number; region: string }, p?: Proposal | null, links?: { proposal?: string; folder?: string }) {
  const lines = [
    `EMPRESA DO VENDEDOR: ${t.tradeName || t.name}${net.region ? ` — ${net.region}` : ''}.`,
    `REDE: ${net.points} pontos estratégicos, ${net.screens} telas${net.daily ? `, média de ${net.daily.toLocaleString('pt-BR')} exibições diárias por tela` : ''}.`,
    'PREÇO PADRÃO: R$ 259,00 por mês por empresa, cobertura integral da rede (confirme com o vendedor antes de oferecer outro valor).',
  ];
  if (links?.folder) lines.push(`LINK DO FOLDER DA REDE: ${links.folder}`);
  if (p) {
    lines.push(
      '', `PROPOSTA Nº ${p.number} PARA O CLIENTE: ${p.tradeName || p.companyName}${p.segment ? ` (${p.segment})` : ''}${p.city ? `, ${p.city}` : ''}.`,
      `Situação da proposta: ${p.status}. Investimento: ${fmtMoney(p.monthlyCents)} por mês${p.priceNote ? ` (${p.priceNote})` : ''}.`,
      p.objective ? `Objetivo do cliente: ${p.objective}` : '',
      p.contactName ? `Contato: ${p.contactName}.` : '',
      `Benefícios oferecidos: ${parseJson<string[]>(p.benefits, []).join(' | ')}`,
      p.conditions ? `Condições: ${p.conditions}` : '',
      p.validUntil ? `Válida até ${p.validUntil.split('-').reverse().join('/')}.` : '',
      links?.proposal ? `LINK DA PROPOSTA (o cliente aceita e assina por ele): ${links.proposal}` : '',
    );
  }
  return lines.filter(Boolean).join('\n');
}

/** Uma resposta do assistente de vendas (ChatGPT). */
export async function salesReply(t: Tenant, context: string, messages: ChatMsg[]): Promise<string> {
  const key = openaiKey(t);
  if (!key) throw new Error('Cadastre a chave da OpenAI (ChatGPT) em Minha empresa → Inteligência artificial para usar o assistente de vendas.');
  const res = await fetch(`${OPENAI_BASE()}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5',
      instructions: `${SYSTEM}\n\nCONTEXTO (dados reais do sistema):\n${context}`,
      max_output_tokens: 4000,
      reasoning: { effort: 'low' },
      input: messages.slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
    }),
  }).catch(() => null);
  if (!res) throw new Error('Não foi possível falar com o ChatGPT agora. Tente de novo.');
  if (res.status === 401) throw new Error('A chave do ChatGPT é inválida. Atualize em Minha empresa → Inteligência artificial.');
  if (res.status === 429) throw new Error('Limite do ChatGPT atingido (ou sem créditos na conta OpenAI). Aguarde um pouco.');
  const data = await res.json().catch(() => null) as null | { output?: { type: string; content?: { type: string; text?: string }[] }[] };
  const text = (data?.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []).map((c) => (c.type === 'output_text' ? c.text ?? '' : '')).join('').trim();
  if (!res.ok || !text) throw new Error(`O ChatGPT não respondeu agora (erro ${res.status}). Tente de novo.`);
  return text;
}
