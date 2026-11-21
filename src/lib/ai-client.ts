import 'server-only';
import type { Tenant } from '@prisma/client';
import { extractText, getDocumentProxy } from 'unpdf';
import { lookupCnpj } from './cnpj';
import { OPENAI_BASE, openaiKey, type Attachment } from './ai-contract';

export type ClientDraft = {
  type: 'PJ' | 'PF'; name: string; tradeName: string; document: string; stateRegistration: string; email: string; phone1: string;
  road: string; number: string; complement: string; neighborhood: string; zipcode: string; city: string; state: string;
};
const FIELDS: (keyof ClientDraft)[] = ['type', 'name', 'tradeName', 'document', 'stateRegistration', 'email', 'phone1', 'road', 'number', 'complement', 'neighborhood', 'zipcode', 'city', 'state'];
const empty = (): ClientDraft => ({ type: 'PJ', name: '', tradeName: '', document: '', stateRegistration: '', email: '', phone1: '', road: '', number: '', complement: '', neighborhood: '', zipcode: '', city: '', state: '' });

/** CNPJ valido (digitos verificadores). */
export function validCnpj(v: string) {
  const d = v.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

async function pdfText(a: Attachment) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(a.data, 'base64')));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).slice(0, 40_000);
  } catch { return ''; }
}

const SYSTEM = `Você extrai dados cadastrais de clientes brasileiros a partir de documentos (cartão CNPJ, contrato social, comprovante de endereço, RG/CNH, cartão de visita etc.).
Devolva somente os dados que aparecem nos documentos; deixe vazio ("") o que não aparecer. Não invente.
- type: "PJ" para empresa (tem CNPJ), "PF" para pessoa física.
- name: razão social (PJ) ou nome completo (PF). tradeName: nome fantasia.
- document: CNPJ ou CPF só com números.
- phone1: um telefone/celular de contato, formato (DD) NNNNN-NNNN.
- state: sigla da UF. zipcode: CEP só com números.`;

/** Pede a IA (OpenAI) para ler os documentos e devolver os campos do cadastro. */
async function aiExtract(key: string, files: Attachment[], texts: string[]): Promise<Partial<ClientDraft>> {
  const props = Object.fromEntries(FIELDS.map((f) => [f, f === 'type' ? { type: 'string', enum: ['PJ', 'PF'] } : { type: 'string' }]));
  const res = await fetch(`${OPENAI_BASE()}/responses`, {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5', instructions: SYSTEM, max_output_tokens: 8000, reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'cliente', strict: true, schema: { type: 'object', properties: props, required: FIELDS, additionalProperties: false } } },
      input: [{
        role: 'user',
        content: [
          ...files.map((a) => (a.mime === 'application/pdf'
            ? { type: 'input_file', filename: a.name, file_data: `data:application/pdf;base64,${a.data}` }
            : { type: 'input_image', image_url: `data:${a.mime};base64,${a.data}` })),
          { type: 'input_text', text: `Extraia os dados cadastrais do cliente destes documentos.${texts.some(Boolean) ? `\n\nTexto extraído dos PDFs:\n${texts.join('\n---\n').slice(0, 30_000)}` : ''}` },
        ],
      }],
    }),
  });
  if (res.status === 401) throw new Error('A chave da OpenAI é inválida. Atualize em Minha empresa → Inteligência artificial.');
  if (res.status === 429) throw new Error('Limite da OpenAI atingido (ou conta sem créditos). Tente de novo em instantes.');
  if (!res.ok) throw new Error(`A IA está indisponível agora (erro ${res.status}).`);
  const data = await res.json() as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
  const text = (data.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []).map((c) => c.text ?? '').join('');
  try { return JSON.parse(text) as Partial<ClientDraft>; } catch { return {}; }
}

/**
 * Le os documentos do cliente e monta o cadastro: a IA (se houver chave da OpenAI) le PDFs e imagens;
 * o CNPJ encontrado e consultado na Receita para completar razao social e endereco.
 */
export async function readClientDocs(t: Tenant, files: Attachment[]): Promise<{ draft: ClientDraft; notes: string[] }> {
  const notes: string[] = [];
  const texts = await Promise.all(files.map((f) => (f.mime === 'application/pdf' ? pdfText(f) : Promise.resolve(''))));
  const draft = empty();
  const key = openaiKey(t);
  if (key) {
    const ai = await aiExtract(key, files, texts);
    for (const f of FIELDS) { const v = String(ai[f] ?? '').trim(); if (v) (draft as Record<string, string>)[f] = v; }
    notes.push('Documentos lidos pela IA.');
  }
  // CNPJ: o que a IA achou ou o primeiro CNPJ valido no texto dos PDFs
  let cnpj = validCnpj(draft.document) ? draft.document.replace(/\D/g, '') : '';
  if (!cnpj) cnpj = (texts.join(' ').match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []).map((x) => x.replace(/\D/g, '')).find(validCnpj) ?? '';
  if (cnpj) {
    draft.type = 'PJ'; draft.document = cnpj;
    try {
      const r = await lookupCnpj(cnpj);
      if (r) {
        // dados oficiais da Receita prevalecem para razao social e endereco
        Object.assign(draft, { name: r.name || draft.name, tradeName: r.tradeName || draft.tradeName, road: r.road || draft.road, number: r.number || draft.number, complement: r.complement || draft.complement, neighborhood: r.neighborhood || draft.neighborhood, city: r.city || draft.city, state: r.state || draft.state, zipcode: r.zipcode || draft.zipcode });
        if (!draft.phone1) draft.phone1 = r.phone; if (!draft.email) draft.email = r.email;
        notes.push(`CNPJ consultado na Receita${r.status ? ` (situação: ${r.status})` : ''}.`);
      }
    } catch { notes.push('A consulta à Receita falhou; confira os dados.'); }
  }
  if (!key && !cnpj) throw new Error('Não encontrei um CNPJ nos documentos. Para ler imagens e outros documentos, cadastre a chave da OpenAI em Minha empresa → Inteligência artificial, ou preencha os dados à mão.');
  draft.zipcode = draft.zipcode.replace(/\D/g, '');
  return { draft, notes };
}
