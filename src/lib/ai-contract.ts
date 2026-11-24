import Anthropic from '@anthropic-ai/sdk';
import type { Client, Subscription, Tenant } from '@prisma/client';
import { fmtMoney } from './money';
import { competenceLabel, addMonths, invoiceItems } from './billing';
import { addressLine, fmtCep, fmtDoc } from './docs';
import { decrypt } from './crypto';

export class ContractError extends Error {}

// Texto fixo (sem dados variaveis) para aproveitar o cache de prompt entre geracoes.
const SYSTEM = `Você redige contratos comerciais brasileiros para empresas de mídia indoor (DOOH: telas digitais em estabelecimentos que exibem anúncios em ciclo).

Escreva um CONTRATO DE PRESTAÇÃO DE SERVIÇOS em português do Brasil, formal, claro e pronto para revisão jurídica, usando somente os dados fornecidos.

Regras:
- Não invente dados. Quando faltar uma informação necessária (endereço, CPF/CNPJ, representante legal, cidade do foro etc.), escreva [PREENCHER: descrição do dado].
- Valores sempre em reais por extenso e em algarismos, exatamente como informados.
- Se o contratante for PARCEIRO (local onde a tela fica instalada), o objeto é a cessão de espaço e a instalação/operação da tela no estabelecimento, com a contraprestação informada; se for CLIENTE (anunciante), o objeto é a veiculação dos anúncios dele nas telas da rede.
- Inclua, nesta ordem, cláusulas numeradas por extenso (CLÁUSULA PRIMEIRA, SEGUNDA...): partes; objeto; especificações da veiculação (conteúdos, duração, formato, aprovação do material, responsabilidade pelo conteúdo); prazo e vigência (período definido ou prazo indeterminado com renovação mensal automática, conforme os dados); preço e forma de pagamento (Pix e/ou boleto, vencimento, multa de 2% e juros de 1% ao mês por atraso, suspensão da veiculação após inadimplência); obrigações da contratada; obrigações do contratante; comprovação de exibição (relatório de exibições); rescisão (aviso prévio de 30 dias, sem multa salvo disposição em contrário); proteção de dados (LGPD); disposições gerais; foro.
- Se houver anexos (modelo de contrato, proposta comercial, tabela de preços, fotos ou documentos), use-os como referência de cláusulas, condições e dados; quando o anexo e os dados cadastrais divergirem, prevalecem os dados cadastrais e as condições comerciais fornecidos em texto.
- Termine com local e data em branco e blocos de assinatura das duas partes e de duas testemunhas.
- Formato: texto simples. Título em maiúsculas na primeira linha. Cada cláusula começa numa linha própria com "CLÁUSULA ... –" seguida do tema em maiúsculas; parágrafos e incisos numerados abaixo. Não use Markdown (sem #, *, tabelas). Não escreva nada antes do título nem depois das assinaturas.`;

const full = (x: { road?: string | null; number?: string | null; complement?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null; zipcode?: string | null }) =>
  [addressLine(x), x.city && `${x.city}${x.state ? '/' + x.state : ''}`, x.zipcode && `CEP ${fmtCep(x.zipcode)}`].filter(Boolean).join(', ');

function describe(t: Tenant, c: Client, sub: Subscription | null, extra: string, screens: string[], attachments: number) {
  const lines = [
    'CONTRATADA (empresa de mídia):',
    `- Razão social: ${t.name}`,
    `- Nome fantasia: ${t.tradeName || 'não informado'}`,
    `- CNPJ: ${fmtDoc(t.document) || 'não informado'}`,
    `- Inscrição estadual: ${t.stateRegistration || 'não informada'}`,
    `- Endereço: ${full(t) || 'não informado'}`,
    `- E-mail: ${t.email || 'não informado'}`,
    `- Telefone: ${t.phone || 'não informado'}`,
    '',
    `CONTRATANTE (${c.kind === 'parceiro' ? 'PARCEIRO — local onde a tela fica instalada' : c.kind === 'cortesia' ? 'CORTESIA — anunciante sem custo' : 'CLIENTE — anunciante'}):`,
    `- ${c.type === 'PF' ? 'Nome' : 'Razão social'}: ${c.name}`,
    ...(c.tradeName ? [`- Nome fantasia: ${c.tradeName}`] : []),
    `- Tipo: ${c.type === 'PF' ? 'pessoa física' : 'pessoa jurídica'}`,
    `- ${c.type === 'PF' ? 'CPF' : 'CNPJ'}: ${fmtDoc(c.document) || 'não informado'}`,
    ...(c.stateRegistration ? [`- Inscrição estadual: ${c.stateRegistration}`] : []),
    `- Endereço: ${full(c) || 'não informado'}`,
    `- E-mail: ${c.email || 'não informado'}`,
    `- Telefone: ${c.phone1 || 'não informado'}`,
    '',
  ];
  if (sub) {
    const items = invoiceItems(sub);
    const end = sub.mode === 'periodo' ? addMonths(sub.startMonth, (sub.months ?? 1) - 1) : null;
    lines.push(
      'CONDIÇÕES COMERCIAIS:',
      ...items.map((i) => `- ${i.description}: ${String(i.quantity).replace('.', ',')} ${i.unit ?? 'un'} × ${fmtMoney(i.unitCents)}`),
      `- Valor mensal total: ${fmtMoney(sub.amountCents)}`,
      `- Vencimento: todo dia ${sub.dueDay} de cada mês`,
      sub.mode === 'periodo'
        ? `- Prazo: ${sub.months} meses, de ${competenceLabel(sub.startMonth)} a ${competenceLabel(end!)} (${sub.months} parcelas)`
        : `- Prazo: indeterminado, com cobrança mensal recorrente a partir de ${competenceLabel(sub.startMonth)}`,
    );
  } else {
    lines.push('CONDIÇÕES COMERCIAIS: não definidas no sistema — use os anexos, se houver, ou [PREENCHER] para valor, vencimento e prazo.');
  }
  lines.push('- Formas de pagamento aceitas: Pix (QR Code na fatura) e boleto bancário.');
  if (screens.length) lines.push('', 'TELAS / LOCAIS DE EXIBIÇÃO ATUAIS DO CONTRATANTE:', ...screens.map((s) => `- ${s}`));
  if (attachments) lines.push('', `ANEXOS: ${attachments} arquivo(s) enviado(s) acima nesta mensagem, para usar como referência.`);
  if (extra.trim()) lines.push('', 'INSTRUÇÕES ADICIONAIS DO USUÁRIO (respeite, desde que não contrariem a lei):', extra.trim().slice(0, 2000));
  return lines.join('\n');
}

export type Attachment = { name: string; mime: string; data: string };

/** Ha alguma IA configurada no servidor? (OpenAI/ChatGPT tem prioridade; Claude como alternativa) */
export const aiConfigured = (t?: Pick<Tenant, 'aiApiKey'>) => !!(openaiKey(t) || process.env.ANTHROPIC_API_KEY);
/** Chave da OpenAI: a cadastrada em Minha empresa; senao a do servidor (OPENAI_API_KEY). */
export const openaiKey = (t?: Pick<Tenant, 'aiApiKey'>) => (t && decrypt(t.aiApiKey)) || process.env.OPENAI_API_KEY || null;
export const OPENAI_BASE = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

/** Testa a chave da OpenAI antes de gravar. Devolve uma mensagem de erro ou null. */
export async function checkOpenAiKey(key: string): Promise<string | null> {
  try {
    const r = await fetch(`${OPENAI_BASE()}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 401) return 'Chave inválida. Confira se copiou a chave inteira (começa com sk-).';
    if (!r.ok) return `A OpenAI recusou a chave (erro ${r.status}).`;
    return null;
  } catch { return 'Não foi possível falar com a OpenAI agora. Tente de novo.'; }
}

/** Redige o contrato com o ChatGPT (API Responses da OpenAI). */
async function draftWithOpenAI(key: string, prompt: string, attachments: Attachment[]) {
  const base = OPENAI_BASE();
  let res: Response;
  try {
    res = await fetch(`${base}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(240_000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5',
        instructions: SYSTEM,
        max_output_tokens: 32000,
        reasoning: { effort: 'low' },
        input: [{
          role: 'user',
          content: [
            ...attachments.map((a) => (a.mime === 'application/pdf'
              ? { type: 'input_file', filename: a.name, file_data: `data:application/pdf;base64,${a.data}` }
              : { type: 'input_image', image_url: `data:${a.mime};base64,${a.data}` })),
            { type: 'input_text', text: prompt },
          ],
        }],
      }),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ContractError('A geração demorou demais. Tente de novo.');
    throw new ContractError('Não foi possível falar com o ChatGPT agora. Tente de novo em instantes.');
  }
  const data = await res.json().catch(() => null) as null | {
    status?: string; incomplete_details?: { reason?: string }; error?: { message?: string };
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  };
  if (res.status === 401) throw new ContractError('A chave da API do ChatGPT é inválida. Atualize em Minha empresa → Inteligência artificial.');
  if (res.status === 429) throw new ContractError('Limite do ChatGPT atingido (muitas gerações seguidas ou sem créditos na conta OpenAI). Aguarde ou verifique os créditos em platform.openai.com.');
  if (!res.ok || !data) throw new ContractError(`O ChatGPT está indisponível agora (erro ${res.status}). Tente de novo em instantes.`);
  const parts = (data.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
  const text = parts.map((c) => (c.type === 'output_text' ? c.text ?? '' : '')).join('').trim();
  if (!text && parts.some((c) => c.type === 'refusal')) throw new ContractError('A IA não conseguiu redigir este contrato. Revise as instruções adicionais e tente de novo.');
  if (!text) throw new ContractError('A IA devolveu um contrato vazio. Tente de novo.');
  if (data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens') return text + '\n\n[ATENÇÃO: o texto foi interrompido por tamanho. Gere novamente ou complete manualmente.]';
  return text;
}

/** Redige o contrato com IA (ChatGPT se OPENAI_API_KEY existir, senao Claude). Pode levar de 30 segundos a 2 minutos. */
export async function draftContract(t: Tenant, c: Client, sub: Subscription | null, extra: string, screens: string[], attachments: Attachment[] = []) {
  const oa = openaiKey(t);
  if (oa) return draftWithOpenAI(oa, `Dados para o contrato:\n\n${describe(t, c, sub, extra, screens, attachments.length)}`, attachments);
  if (!process.env.ANTHROPIC_API_KEY) throw new ContractError('A geração de contratos com IA ainda não foi configurada. Cadastre a chave da OpenAI em Minha empresa → Inteligência artificial.');
  const client = new Anthropic({ timeout: 240_000, maxRetries: 1 });
  try {
    // streaming evita estouro de tempo em respostas longas; finalMessage() junta o resultado
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // se o modelo recusar por politica de seguranca, o proprio servidor tenta de novo num modelo alternativo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          // anexos antes do texto: PDF como documento, imagens como imagem
          ...attachments.map((a) => (a.mime === 'application/pdf'
            ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: a.data }, title: a.name }
            : { type: 'image' as const, source: { type: 'base64' as const, media_type: a.mime as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: a.data } })),
          { type: 'text' as const, text: `Dados para o contrato:\n\n${describe(t, c, sub, extra, screens, attachments.length)}` },
        ],
      }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new ContractError('A IA não conseguiu redigir este contrato. Revise as instruções adicionais e tente de novo.');
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (!text) throw new ContractError('A IA devolveu um contrato vazio. Tente de novo.');
    if (msg.stop_reason === 'max_tokens') return text + '\n\n[ATENÇÃO: o texto foi interrompido por tamanho. Gere novamente ou complete manualmente.]';
    return text;
  } catch (e) {
    if (e instanceof ContractError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ContractError('A chave da API da Anthropic configurada no servidor é inválida.');
    if (e instanceof Anthropic.RateLimitError) throw new ContractError('Muitas gerações seguidas. Aguarde um minuto e tente de novo.');
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ContractError('A geração demorou demais. Tente de novo.');
    if (e instanceof Anthropic.APIError) throw new ContractError(`O serviço de IA está indisponível agora (erro ${e.status ?? 'de conexão'}). Tente de novo em instantes.`);
    throw e;
  }
}
