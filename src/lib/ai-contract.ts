import Anthropic from '@anthropic-ai/sdk';
import type { Client, Subscription, Tenant } from '@prisma/client';
import { fmtMoney } from './money';
import { competenceLabel, addMonths, invoiceItems } from './billing';

export class ContractError extends Error {}

// Texto fixo (sem dados variaveis) para aproveitar o cache de prompt entre geracoes.
const SYSTEM = `Você redige contratos comerciais brasileiros para empresas de mídia indoor (DOOH: telas digitais em estabelecimentos que exibem anúncios em ciclo).

Escreva um CONTRATO DE PRESTAÇÃO DE SERVIÇOS em português do Brasil, formal, claro e pronto para revisão jurídica, usando somente os dados fornecidos.

Regras:
- Não invente dados. Quando faltar uma informação necessária (endereço, CPF/CNPJ, representante legal, cidade do foro etc.), escreva [PREENCHER: descrição do dado].
- Valores sempre em reais por extenso e em algarismos, exatamente como informados.
- Se o contratante for PARCEIRO (local onde a tela fica instalada), o objeto é a cessão de espaço e a instalação/operação da tela no estabelecimento, com a contraprestação informada; se for CLIENTE (anunciante), o objeto é a veiculação dos anúncios dele nas telas da rede.
- Inclua, nesta ordem, cláusulas numeradas por extenso (CLÁUSULA PRIMEIRA, SEGUNDA...): partes; objeto; especificações da veiculação (conteúdos, duração, formato, aprovação do material, responsabilidade pelo conteúdo); prazo e vigência (período definido ou prazo indeterminado com renovação mensal automática, conforme os dados); preço e forma de pagamento (Pix e/ou boleto, vencimento, multa de 2% e juros de 1% ao mês por atraso, suspensão da veiculação após inadimplência); obrigações da contratada; obrigações do contratante; comprovação de exibição (relatório de exibições); rescisão (aviso prévio de 30 dias, sem multa salvo disposição em contrário); proteção de dados (LGPD); disposições gerais; foro.
- Termine com local e data em branco e blocos de assinatura das duas partes e de duas testemunhas.
- Formato: texto simples. Título em maiúsculas na primeira linha. Cada cláusula começa numa linha própria com "CLÁUSULA ... –" seguida do tema em maiúsculas; parágrafos e incisos numerados abaixo. Não use Markdown (sem #, *, tabelas). Não escreva nada antes do título nem depois das assinaturas.`;

function describe(t: Tenant, c: Client, sub: Subscription | null, extra: string, screens: string[]) {
  const addr = [c.road, c.number, c.complement, c.neighborhood, c.city && `${c.city}${c.state ? '/' + c.state : ''}`, c.zipcode && `CEP ${c.zipcode}`].filter(Boolean).join(', ');
  const lines = [
    'CONTRATADA (empresa de mídia):',
    `- Razão social/nome: ${t.name}`,
    `- CNPJ: ${t.document || 'não informado'}`,
    '',
    `CONTRATANTE (${c.kind === 'parceiro' ? 'PARCEIRO — local onde a tela fica instalada' : 'CLIENTE — anunciante'}):`,
    `- Nome: ${c.name}`,
    `- Tipo: ${c.type === 'PF' ? 'pessoa física' : 'pessoa jurídica'}`,
    `- ${c.type === 'PF' ? 'CPF' : 'CNPJ'}: ${c.document || 'não informado'}`,
    `- Endereço: ${addr || 'não informado'}`,
    `- E-mail: ${c.email || 'não informado'}`,
    `- Telefone: ${c.phone1 || 'não informado'}`,
    '',
  ];
  if (sub) {
    const items = invoiceItems(sub);
    const end = sub.mode === 'periodo' ? addMonths(sub.startMonth, (sub.months ?? 1) - 1) : null;
    lines.push(
      'CONDIÇÕES COMERCIAIS:',
      ...items.map((i) => `- ${i.description}: ${String(i.quantity).replace('.', ',')} × ${fmtMoney(i.unitCents)}`),
      `- Valor mensal total: ${fmtMoney(sub.amountCents)}`,
      `- Vencimento: todo dia ${sub.dueDay} de cada mês`,
      sub.mode === 'periodo'
        ? `- Prazo: ${sub.months} meses, de ${competenceLabel(sub.startMonth)} a ${competenceLabel(end!)} (${sub.months} parcelas)`
        : `- Prazo: indeterminado, com cobrança mensal recorrente a partir de ${competenceLabel(sub.startMonth)}`,
    );
  } else {
    lines.push('CONDIÇÕES COMERCIAIS: não definidas no sistema — use [PREENCHER] para valor, vencimento e prazo.');
  }
  lines.push('- Formas de pagamento aceitas: Pix (QR Code na fatura) e boleto bancário.');
  if (screens.length) lines.push('', 'TELAS / LOCAIS DE EXIBIÇÃO ATUAIS DO CONTRATANTE:', ...screens.map((s) => `- ${s}`));
  if (extra.trim()) lines.push('', 'INSTRUÇÕES ADICIONAIS DO USUÁRIO (respeite, desde que não contrariem a lei):', extra.trim().slice(0, 2000));
  return lines.join('\n');
}

/** Redige o contrato com Claude. Pode levar de 30 segundos a 2 minutos. */
export async function draftContract(t: Tenant, c: Client, sub: Subscription | null, extra: string, screens: string[]) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ContractError('A geração de contratos com IA ainda não foi configurada no servidor (falta a chave ANTHROPIC_API_KEY).');
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
      messages: [{ role: 'user', content: `Dados para o contrato:\n\n${describe(t, c, sub, extra, screens)}` }],
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
