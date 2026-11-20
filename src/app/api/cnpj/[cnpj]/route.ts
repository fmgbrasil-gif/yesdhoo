import { getUser } from '@/lib/auth';

export type CnpjData = {
  name: string; tradeName: string; road: string; number: string; complement: string; neighborhood: string;
  city: string; state: string; zipcode: string; phone: string; email: string; status: string; activity: string;
};

const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Gestao-DOOH/1.0)' }, cache: 'no-store' });
const phoneFmt = (p?: string | null) => {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d;
};
const title = (s?: string | null) => (s ?? '').trim();

/** Dados publicos do CNPJ (Receita Federal) via BrasilAPI, com a CNPJ.ws como reserva. */
async function lookup(cnpj: string): Promise<CnpjData | null> {
  try {
    const r = await get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (r.ok) {
      const d = await r.json();
      return {
        name: title(d.razao_social), tradeName: title(d.nome_fantasia), road: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ').trim(),
        number: title(d.numero), complement: title(d.complemento), neighborhood: title(d.bairro), city: title(d.municipio), state: title(d.uf),
        zipcode: title(d.cep), phone: phoneFmt(d.ddd_telefone_1), email: title(d.email).toLowerCase(), status: title(d.descricao_situacao_cadastral), activity: title(d.cnae_fiscal_descricao),
      };
    }
    if (r.status === 404) return null;
  } catch { /* tenta a reserva */ }
  const r = await get(`https://publica.cnpj.ws/cnpj/${cnpj}`);
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error('indisponivel');
  const d = await r.json();
  const e = d.estabelecimento ?? {};
  return {
    name: title(d.razao_social), tradeName: title(e.nome_fantasia), road: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' ').trim(), number: title(e.numero),
    complement: title(e.complemento), neighborhood: title(e.bairro), city: title(e.cidade?.nome), state: title(e.estado?.sigla), zipcode: title(e.cep),
    phone: phoneFmt(`${e.ddd1 ?? ''}${e.telefone1 ?? ''}`), email: title(e.email).toLowerCase(), status: title(e.situacao_cadastral), activity: title(e.atividade_principal?.descricao),
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Faça login.' }, { status: 401 });
  const cnpj = (await params).cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) return Response.json({ error: 'Informe um CNPJ com 14 dígitos.' }, { status: 400 });
  try {
    const data = await lookup(cnpj);
    if (!data) return Response.json({ error: 'CNPJ não encontrado na Receita Federal.' }, { status: 404 });
    return Response.json(data);
  } catch {
    return Response.json({ error: 'A consulta à Receita está fora do ar agora. Preencha manualmente ou tente de novo.' }, { status: 502 });
  }
}
