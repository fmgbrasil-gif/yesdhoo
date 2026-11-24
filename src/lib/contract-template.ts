import type { Client, Tenant } from '@prisma/client';
import { fmtMoney, fmtDate } from './money';
import { addressLine, fmtCep, fmtDoc, moneyInWords } from './docs';
import { competenceLabel } from './billing';
import extenso from 'extenso';

export type ContractCharge = { mode: string; amountCents: number; dueDay?: number | null; startMonth?: string | null; months?: number | null; dueDate?: string | null };
export type ContractOperation = { name: string; screens: { name: string; city?: string | null; state?: string | null; road?: string | null; number?: string | null; neighborhood?: string | null }[] };

const ORD = ['PRIMEIRA', 'SEGUNDA', 'TERCEIRA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÉTIMA', 'OITAVA', 'NONA', 'DÉCIMA'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const longDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };

type Party = Pick<Tenant, 'name' | 'tradeName' | 'document' | 'road' | 'number' | 'complement' | 'neighborhood' | 'city' | 'state' | 'zipcode'> & { type?: string };
function party(p: Party) {
  const doc = fmtDoc(p.document);
  const isPf = p.type === 'PF';
  const addr = [addressLine(p), p.city && `${p.city}${p.state ? '/' + p.state : ''}`, p.zipcode && `CEP ${fmtCep(p.zipcode)}`].filter(Boolean).join(', ');
  return `${p.name.toUpperCase()}${p.tradeName ? ` (nome fantasia ${p.tradeName})` : ''}, ${isPf ? 'pessoa física' : 'pessoa jurídica de direito privado'}, inscrita no ${isPf ? 'CPF' : 'CNPJ'} sob o nº ${doc || '[PREENCHER]'}, ${addr ? `com ${isPf ? 'endereço' : 'sede'} em ${addr}` : 'com endereço [PREENCHER]'}`;
}

/**
 * Contrato basico de veiculacao, sempre no mesmo padrao: partes, objeto (pontos da operacao), valor mensal,
 * vigencia (prazo indeterminado), conteudo proibido, responsabilidade do contratante, cancelamento com
 * 30 dias de aviso e sem multa, e foro.
 */
export function basicContract(t: Tenant, c: Client, charge: ContractCharge, op: ContractOperation | null, today: string) {
  const contratada = t.tradeName || t.name;
  const place = (x: ContractOperation['screens'][number]) => [addressLine(x), x.city && `${x.city}${x.state ? '/' + x.state : ''}`].filter(Boolean).join(', ');
  const screens = op?.screens ?? [];
  const points = screens.length
    ? screens.map((x, i) => `${i + 1}. ${x.name}${place(x) ? ` — ${place(x)}` : ''}`).join('\n')
    : '1. [PREENCHER: pontos de exibição]';
  const qty = screens.length ? `${screens.length} (${extenso(screens.length, { mode: 'number' })}) ponto${screens.length === 1 ? '' : 's'}` : 'pontos';
  const cortesia = charge.mode === 'cortesia';
  const start = charge.mode === 'avulsa' || cortesia ? today : `${charge.startMonth ?? today.slice(0, 7)}-01`;
  const value = `${fmtMoney(charge.amountCents)} (${moneyInWords(charge.amountCents).toLowerCase()})`;
  const clauses: [string, string][] = [
    ['DO OBJETO', `O presente contrato tem por objeto a veiculação, pela CONTRATADA, de conteúdos publicitários do CONTRATANTE (vídeos e imagens) nas telas digitais de mídia indoor da operação "${op?.name ?? '[PREENCHER]'}", nos pontos relacionados na Cláusula Segunda.`],
    ['DOS PONTOS DE VEICULAÇÃO', `As propagandas do CONTRATANTE serão veiculadas nos seguintes ${qty}:\n${points}\n\nParágrafo único. Os conteúdos serão exibidos em ciclo, junto com os de outros anunciantes, durante o horário de funcionamento de cada ponto. A inclusão ou troca de pontos depende de acordo entre as partes.`],
    cortesia ? ['DA CORTESIA (SEM CUSTO)', 'A veiculação objeto deste contrato é concedida pela CONTRATADA a título de cortesia, sem qualquer custo para o CONTRATANTE. Não há cobrança de mensalidade, taxa de adesão ou qualquer outro valor, e nenhuma fatura será emitida em razão deste contrato.\n\nParágrafo único. A cortesia não gera vínculo de parceria nem obrigação de pagamento futuro. Eventual passagem para veiculação paga dependerá de novo acordo, por escrito, entre as partes.']
    : ['DO VALOR E DA FORMA DE PAGAMENTO', charge.mode === 'avulsa'
      ? `Pela veiculação, o CONTRATANTE pagará à CONTRATADA o valor de ${value}, com vencimento em ${fmtDate(charge.dueDate ?? today)}, por Pix ou boleto, conforme a fatura enviada pela CONTRATADA.`
      : `Pela veiculação, o CONTRATANTE pagará à CONTRATADA o valor mensal de ${value}, com vencimento todo dia ${charge.dueDay ?? 10} de cada mês, a partir de ${competenceLabel(start.slice(0, 7))}, por Pix ou boleto, conforme a fatura enviada mensalmente pela CONTRATADA.\n\nParágrafo único. O atraso no pagamento permite à CONTRATADA suspender a veiculação até a regularização.`],
    ['DA VIGÊNCIA', cortesia
      ? `Este contrato vigora por prazo indeterminado, a partir de ${longDate(start)}, enquanto durar a cortesia.`
      : charge.mode === 'periodo' && charge.months
      ? `Este contrato vigora pelo prazo de ${charge.months} (${extenso(charge.months, { mode: 'number' })}) meses, a partir de ${longDate(start)}, podendo ser renovado por acordo entre as partes.`
      : charge.mode === 'avulsa'
        ? `Este contrato vigora a partir de ${longDate(start)}, pelo período de veiculação contratado.`
        : `Este contrato vigora por prazo indeterminado, a partir de ${longDate(start)}.`],
    ['DO CONTEÚDO PROIBIDO', 'É proibida a veiculação de conteúdo ofensivo, ilegal, discriminatório, obsceno, que incite violência ou que denigra a imagem ou a honra de qualquer pessoa, empresa, marca ou instituição. A CONTRATADA poderá recusar ou retirar do ar, a qualquer momento e sem aviso prévio, o conteúdo que contrarie esta cláusula, sem que isso gere qualquer indenização ao CONTRATANTE.'],
    ['DA RESPONSABILIDADE PELO CONTEÚDO', 'O CONTRATANTE é o único e total responsável pelo conteúdo que fornecer para veiculação, inclusive por textos, imagens, marcas, músicas, direitos autorais, direito de imagem e veracidade das informações, respondendo integralmente, perante a CONTRATADA e terceiros, por qualquer reclamação, dano ou ação judicial decorrente desse conteúdo, ficando a CONTRATADA isenta de qualquer responsabilidade.'],
    ['DO CANCELAMENTO', cortesia
      ? 'Qualquer das partes poderá encerrar este contrato e a cortesia a qualquer tempo, mediante aviso prévio por escrito (e-mail ou WhatsApp) com antecedência mínima de 30 (trinta) dias, sem cobrança de multa ou de qualquer outro valor.'
      : 'Qualquer das partes poderá cancelar este contrato a qualquer tempo, mediante aviso prévio por escrito (e-mail ou WhatsApp) com antecedência mínima de 30 (trinta) dias, sem cobrança de multa. Durante o período de aviso prévio a veiculação continua e os valores correspondentes são devidos.'],
    ['DO FORO', `Fica eleito o foro da comarca de ${t.city ? `${t.city}${t.state ? '/' + t.state : ''}` : '[PREENCHER]'} para resolver qualquer questão decorrente deste contrato.`],
  ];
  return [
    `CONTRATO DE VEICULAÇÃO DE MÍDIA INDOOR${cortesia ? ' EM CORTESIA (SEM CUSTO)' : ''}`,
    '',
    `CONTRATADA: ${party(t)}, doravante denominada CONTRATADA.`,
    '',
    `CONTRATANTE: ${party(c)}, doravante denominado(a) CONTRATANTE.`,
    '',
    'As partes acima identificadas celebram o presente contrato, que se regerá pelas cláusulas a seguir.',
    '',
    ...clauses.flatMap(([h, txt], i) => [`CLÁUSULA ${ORD[i]} – ${h}`, txt, '']),
    'E, por estarem de acordo, as partes assinam o presente contrato.',
    '',
    `${t.city || '[CIDADE]'}, ${longDate(today)}.`,
    '',
    '',
    '_____________________________________________',
    `CONTRATADA: ${contratada}`,
    '',
    '',
    '_____________________________________________',
    `CONTRATANTE: ${c.tradeName || c.name}`,
  ].join('\n');
}
